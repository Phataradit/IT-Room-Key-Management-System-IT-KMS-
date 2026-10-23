"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Drawer,
  Empty,
  Form,
  Input,
  Modal,
  Progress,
  Select,
  Space,
  Statistic,
  Steps,
  Table,
  Tabs,
  Tag,
  Typography,
  Upload,
  message,
  type TableProps,
  type UploadFile,
  type UploadProps,
} from "antd";
import { PlusOutlined, UploadOutlined } from "@ant-design/icons";

type DayName = "MONDAY" | "TUESDAY" | "WEDNESDAY" | "THURSDAY" | "FRIDAY" | "SATURDAY" | "SUNDAY";
type RoomOption = { id: string; roomCode: string; roomName: string; building: string };
type NormalizedWord = {
  text: string;
  confidence: number | null;
  source: "PDF_TEXT" | "OCR";
  x: number;
  y: number;
  width: number;
  height: number;
};
type PageCell = {
  sourceCellKey: string;
  dayOfWeek: DayName | null;
  startPeriod: number;
  endPeriod: number;
  startTime: string | null;
  endTime: string | null;
  sourceCellText: string;
  sourceConfidence: number | null;
  bounds: { x: number; y: number; width: number; height: number };
  words: NormalizedWord[];
  empty: boolean;
};
type PageExtraction = {
  page: number;
  width: number;
  height: number;
  textSource: "PDF_TEXT" | "OCR";
  gridDetected: boolean;
  grid: { x: number[]; y: number[] } | null;
  periods: Array<{ period: number; startTime: string | null; endTime: string | null }>;
  cells: PageCell[];
  rawWords: NormalizedWord[];
};
type CourseCatalogEntry = {
  courseCode: string;
  subject: string | null;
  sourceText: string;
  confidence: number | null;
  bounds: { x: number; y: number; width: number; height: number };
};
type ImportRow = {
  id: string;
  sourcePage: number;
  sourceCellKey: string;
  sourceCellText: string;
  sourceConfidence: number | null;
  sourceBounds: { x: number; y: number; width: number; height: number };
  sourceWords: NormalizedWord[];
  sourceStructured: {
    courseCode: string | null;
    subject: string | null;
    teacherName: string | null;
    className: string | null;
    dayOfWeek: DayName | null;
    startTime: string | null;
    endTime: string | null;
    semester: string | null;
    academicYear: string | null;
  };
  sourceBuilding: string | null;
  roomCode: string | null;
  roomId: string | null;
  roomSource: "PDF_TEXT" | "OCR" | "FILE_NAME" | null;
  dayOfWeek: DayName | null;
  startTime: string | null;
  endTime: string | null;
  courseCode: string | null;
  subject: string | null;
  teacherName: string | null;
  className: string | null;
  semester: string | null;
  academicYear: string | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  duplicate: boolean;
};
type PreviewResult = {
  fileName: string;
  fileHash: string;
  pageCount: number;
  successfulPages: number;
  failedPages: number[];
  pageWarnings: Array<{ page: number; message: string }>;
  confidenceThresholds: { confident: number; review: number };
  roomCodes: string[];
  courseCatalog: CourseCatalogEntry[];
  pages: PageExtraction[];
  rows: ImportRow[];
  rooms: RoomOption[];
};
type ImportSummary = { imported: number; duplicates: number; failed: number; results: Array<{ sourcePage: number; status: string; message?: string }> };
type EditableRow = Omit<ImportRow, "id" | "duplicate" | "roomSource">;

const days: Array<{ value: DayName; label: string }> = [
  { value: "MONDAY", label: "จันทร์" },
  { value: "TUESDAY", label: "อังคาร" },
  { value: "WEDNESDAY", label: "พุธ" },
  { value: "THURSDAY", label: "พฤหัสบดี" },
  { value: "FRIDAY", label: "ศุกร์" },
  { value: "SATURDAY", label: "เสาร์" },
  { value: "SUNDAY", label: "อาทิตย์" },
];
const dayLabel = Object.fromEntries(days.map((day) => [day.value, day.label])) as Record<DayName, string>;

async function responseJson<T>(response: Response): Promise<T> {
  const body = await response.json() as { success: boolean; message?: string; data?: T };
  if (!response.ok || !body.success || body.data === undefined) {
    throw new Error(body.message ?? "ดำเนินการไม่สำเร็จ");
  }
  return body.data;
}

function rowProblems(row: ImportRow) {
  const problems: string[] = [];
  if (!row.roomId) problems.push("เลือกห้อง");
  if (!row.dayOfWeek) problems.push("ตรวจวัน");
  if (!row.startTime || !row.endTime) problems.push("ตรวจเวลา");
  else if (row.startTime >= row.endTime) problems.push("ช่วงเวลาไม่ถูกต้อง");
  if (row.effectiveFrom && row.effectiveTo && row.effectiveFrom > row.effectiveTo) problems.push("ช่วงวันที่ไม่ถูกต้อง");
  return problems;
}

function editedFields(row: ImportRow) {
  const structured = row.sourceStructured;
  return ([
    ["courseCode", row.courseCode],
    ["subject", row.subject],
    ["teacherName", row.teacherName],
    ["className", row.className],
    ["dayOfWeek", row.dayOfWeek],
    ["startTime", row.startTime],
    ["endTime", row.endTime],
    ["semester", row.semester],
    ["academicYear", row.academicYear],
  ] as const).filter(([key, value]) => (structured[key] ?? null) !== (value ?? null)).map(([key]) => key);
}

function confidenceLabel(confidence: number | null, thresholds: PreviewResult["confidenceThresholds"]) {
  if (confidence === null) return "อ่านข้อความจาก PDF";
  if (confidence >= thresholds.confident) return "อ่านได้ค่อนข้างชัด · ตรวจทาน";
  if (confidence >= thresholds.review) return "ควรตรวจสอบ";
  return "อ่านไม่ชัด";
}

export function RoomScheduleImport({
  rooms,
  onImported,
  onManualCreate,
}: {
  rooms: RoomOption[];
  onImported: () => void;
  onManualCreate: () => void;
}) {
  const [messageApi, contextHolder] = message.useMessage();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [fileUrl, setFileUrl] = useState("");
  const fileUrlRef = useRef("");
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [stage, setStage] = useState<"SELECT" | "REVIEW" | "RESULT">("SELECT");
  const [working, setWorking] = useState(false);
  const [progress, setProgress] = useState<{ page: number; pageCount: number; status: string } | null>(null);
  const [editingRow, setEditingRow] = useState<ImportRow | null>(null);
  const [pageToView, setPageToView] = useState<number | null>(null);
  const [cellToView, setCellToView] = useState("");
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [form] = Form.useForm<EditableRow>();
  const roomOptions = useMemo(
    () => rooms.map((room) => ({ value: room.id, label: `${room.roomCode} · ${room.roomName}` })),
    [rooms],
  );
  const validCount = rows.filter((row) => !row.duplicate && rowProblems(row).length === 0).length;
  const selectedRows = rows.filter((row) => selectedKeys.includes(row.id));
  const pageExtraction = preview?.pages.find((page) => page.page === pageToView) ?? null;
  const viewedCell = pageExtraction?.cells.find((cell) => cell.sourceCellKey === cellToView) ?? null;
  const reviewCount = rows.filter((row) =>
    rowProblems(row).length > 0
    || row.duplicate
    || row.sourceConfidence === null
    || row.sourceConfidence < (preview?.confidenceThresholds.review ?? 50)
    || !row.courseCode
    || !row.className
    || !row.teacherName).length;

  useEffect(() => () => {
    if (fileUrlRef.current) URL.revokeObjectURL(fileUrlRef.current);
  }, []);

  const replaceFile = (newFile: File | null) => {
    if (fileUrlRef.current) URL.revokeObjectURL(fileUrlRef.current);
    fileUrlRef.current = newFile ? URL.createObjectURL(newFile) : "";
    setFileUrl(fileUrlRef.current);
    setFile(newFile);
  };

  const reset = () => {
    replaceFile(null);
    setPreview(null);
    setRows([]);
    setSelectedKeys([]);
    setProgress(null);
    setPageToView(null);
    setSummary(null);
    setStage("SELECT");
  };

  const onBeforeUpload: UploadProps["beforeUpload"] = (selectedFile) => {
    replaceFile(selectedFile);
    setPreview(null);
    setRows([]);
    setSelectedKeys([]);
    setStage("SELECT");
    return Upload.LIST_IGNORE;
  };

  const readPdf = async () => {
    if (!file) {
      messageApi.warning("กรุณาเลือกไฟล์ PDF");
      return;
    }
    setWorking(true);
    setProgress({ page: 0, pageCount: 0, status: "กำลังส่งไฟล์ไปตรวจสอบ" });
    try {
      const formData = new FormData();
      formData.set("file", file);
      const response = await fetch("/api/room-timetable/import/preview", {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        const error = await response.json() as { message?: string };
        throw new Error(error.message ?? "ส่งไฟล์ไม่สำเร็จ");
      }
      if (!response.body) throw new Error("ไม่สามารถอ่านสถานะการประมวลผลได้");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let completed: PreviewResult | null = null;
      let streamError = "";
      const handleEvent = (block: string) => {
        const event = block.match(/^event: (.+)$/m)?.[1];
        const dataLine = block.split("\n").find((line) => line.startsWith("data: "));
        if (!event || !dataLine) return;
        const value = JSON.parse(dataLine.slice(6)) as PreviewResult | { page: number; pageCount: number; status: string } | { message?: string };
        if (event === "progress") {
          const update = value as { page: number; pageCount: number; status: string };
          setProgress(update);
        } else if (event === "complete") {
          completed = value as PreviewResult;
        } else if (event === "error") {
          streamError = (value as { message?: string }).message ?? "อ่าน PDF ไม่สำเร็จ";
        }
      };
      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const blocks = buffer.split("\n\n");
        buffer = blocks.pop() ?? "";
        blocks.forEach(handleEvent);
        if (done) break;
      }
      if (streamError) throw new Error(streamError);
      if (!completed) throw new Error("ไม่ได้รับผลการอ่าน PDF จากเซิร์ฟเวอร์");
      const result = completed as PreviewResult;
      const initializedRows = result.rows.map((row) => ({ ...row, id: `${row.sourcePage}:${row.sourceCellKey}` }));
      setPreview(result);
      setRows(initializedRows);
      setSelectedKeys(initializedRows
        .filter((row) => !row.duplicate && rowProblems(row).length === 0)
        .map((row) => row.id));
      setStage("REVIEW");
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "อ่าน PDF ไม่สำเร็จ");
    } finally {
      setWorking(false);
    }
  };

  const openEditor = (row: ImportRow) => {
    setEditingRow(row);
    form.setFieldsValue({
      sourcePage: row.sourcePage,
      sourceCellKey: row.sourceCellKey,
      sourceCellText: row.sourceCellText,
      sourceConfidence: row.sourceConfidence,
      sourceBuilding: row.sourceBuilding,
      roomCode: row.roomCode,
      roomId: row.roomId,
      dayOfWeek: row.dayOfWeek,
      startTime: row.startTime ?? "",
      endTime: row.endTime ?? "",
      courseCode: row.courseCode,
      subject: row.subject,
      teacherName: row.teacherName,
      className: row.className,
      semester: row.semester,
      academicYear: row.academicYear,
      effectiveFrom: row.effectiveFrom,
      effectiveTo: row.effectiveTo,
    });
  };

  const saveEditedRow = async () => {
    if (!editingRow) return;
    try {
      const values = await form.validateFields();
      const selectedRoom = rooms.find((room) => room.id === values.roomId);
      setRows((current) => current.map((row) => row.id === editingRow.id ? {
        ...row,
        ...values,
        roomCode: selectedRoom?.roomCode ?? null,
        effectiveFrom: values.effectiveFrom || null,
        effectiveTo: values.effectiveTo || null,
      } : row));
      setEditingRow(null);
    } catch {
      messageApi.warning("กรุณาตรวจสอบช่องที่ระบุ");
    }
  };

  const importSelected = async () => {
    if (!preview || !selectedRows.length) return;
    setWorking(true);
    try {
      const response = await fetch("/api/room-timetable/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileHash: preview.fileHash,
          fileName: preview.fileName,
          pageCount: preview.pageCount,
          rawExtraction: {
            pages: preview.pages,
            courseCatalog: preview.courseCatalog,
          },
          rows: selectedRows.map((row) => ({
            sourcePage: row.sourcePage,
            sourceCellKey: row.sourceCellKey,
            sourceCellText: row.sourceCellText,
            sourceConfidence: row.sourceConfidence,
            sourceBounds: row.sourceBounds,
            sourceWords: row.sourceWords,
            sourceStructured: row.sourceStructured,
            sourceBuilding: row.sourceBuilding,
            roomId: row.roomId,
            dayOfWeek: row.dayOfWeek,
            startTime: row.startTime,
            endTime: row.endTime,
            courseCode: row.courseCode,
            subject: row.subject,
            teacherName: row.teacherName,
            className: row.className,
            semester: row.semester,
            academicYear: row.academicYear,
            effectiveFrom: row.effectiveFrom || null,
            effectiveTo: row.effectiveTo || null,
          })),
        }),
      });
      const result = await responseJson<ImportSummary>(response);
      setSummary(result);
      setStage("RESULT");
      if (result.imported) onImported();
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "นำเข้าตารางไม่สำเร็จ");
    } finally {
      setWorking(false);
    }
  };

  const columns: TableProps<ImportRow>["columns"] = [
    { title: "หน้า", dataIndex: "sourcePage", width: 62, fixed: "left" },
    {
      title: "ห้อง",
      key: "room",
      width: 145,
      render: (_, row) => {
        const room = rooms.find((item) => item.id === row.roomId);
        return <span>{room ? `${room.roomCode} · ${room.roomName}` : row.roomCode ? `ไม่พบห้อง ${row.roomCode}` : "ไม่พบหมายเลขห้อง"}</span>;
      },
    },
    { title: "วัน", dataIndex: "dayOfWeek", width: 75, render: (day: DayName | null) => day ? dayLabel[day] : "ไม่พบ" },
    {
      title: "เวลา",
      key: "time",
      width: 115,
      render: (_, row) => `${row.startTime ?? "?"}–${row.endTime ?? "?"}`,
    },
    { title: "รหัสวิชา", dataIndex: "courseCode", width: 120, render: (value: string | null) => value ?? "—" },
    { title: "ชื่อวิชา", dataIndex: "subject", width: 180, render: (value: string | null) => value ?? "ไม่พบข้อมูล" },
    { title: "ครูผู้สอน", dataIndex: "teacherName", width: 130, render: (value: string | null) => value ?? "ไม่พบข้อมูล" },
    { title: "กลุ่มเรียน", dataIndex: "className", width: 115, render: (value: string | null) => value ?? "ไม่พบข้อมูล" },
    {
      title: "ผลตรวจ",
      key: "review",
      width: 160,
      render: (_, row) => {
        const changes = editedFields(row);
        if (row.duplicate) return <Tag color="default">นำเข้าแล้ว</Tag>;
        const problems = rowProblems(row);
        return (
          <Space wrap size={4}>
            {problems.length
              ? <Tag color="red">{problems.join(" · ")}</Tag>
              : <Tag color={row.sourceConfidence !== null && row.sourceConfidence < 50 ? "orange" : "blue"}>
                {confidenceLabel(row.sourceConfidence, preview?.confidenceThresholds ?? { confident: 80, review: 50 })}
              </Tag>}
            {changes.length > 0 && <Tag color="purple">แก้ {changes.length} ฟิลด์</Tag>}
          </Space>
        );
      },
    },
    {
      title: "ดำเนินการ",
      key: "action",
      width: 150,
      fixed: "right",
      render: (_, row) => (
        <Space size={4}>
          <Button size="small" onClick={() => openEditor(row)}>ตรวจ/แก้ไข</Button>
          <Button size="small" onClick={() => {
            setPageToView(row.sourcePage);
            setCellToView(row.sourceCellKey);
          }}>PDF</Button>
        </Space>
      ),
    },
  ];

  const uploadFileList: UploadFile[] = file ? [{
    uid: "pdf-import-file",
    name: file.name,
    size: file.size,
    type: file.type,
    status: "done",
  }] : [];

  return (
    <>
      {contextHolder}
      <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>
        เพิ่มตารางประจำห้อง
      </Button>
      <Modal
        title="นำเข้าตารางประจำห้องจาก PDF"
        open={open}
        onCancel={() => {
          if (working) return;
          setOpen(false);
          reset();
        }}
        width={1180}
        footer={null}
        destroyOnHidden
      >
        <Steps
          current={stage === "SELECT" ? 0 : stage === "REVIEW" ? 1 : 2}
          items={[{ title: "เลือกและอ่าน PDF" }, { title: "ตรวจสอบข้อมูล" }, { title: "ผลการนำเข้า" }]}
        />
        {stage === "SELECT" && (
          <div className="schedule-import-step">
            <Alert
              type="info"
              showIcon
              message="ระบบอ่าน PDF ทุกหน้าบนเซิร์ฟเวอร์ของระบบด้วย OCR ภาษาไทยและอังกฤษที่ติดตั้งไว้ในเครื่อง"
              description="ไฟล์ต้นฉบับไม่ถูกบันทึกลงฐานข้อมูลหรือส่งไปบริการ OCR ภายนอก ข้อมูลที่อ่านได้จะยังไม่ถูกบันทึกจนกว่าจะตรวจและยืนยัน"
            />
            <Upload.Dragger
              accept="application/pdf,.pdf"
              maxCount={1}
              fileList={uploadFileList}
              beforeUpload={onBeforeUpload}
              onRemove={() => {
                replaceFile(null);
                setPreview(null);
                setRows([]);
                return true;
              }}
              disabled={working}
            >
              <p className="ant-upload-drag-icon"><UploadOutlined /></p>
              <p className="ant-upload-text">ลากไฟล์ PDF มาวาง หรือคลิกเพื่อเลือกไฟล์</p>
              <p className="ant-upload-hint">
                ขนาดไม่เกิน {Math.floor(Number(process.env.NEXT_PUBLIC_ROOM_SCHEDULE_IMPORT_MAX_BYTES || 25 * 1024 * 1024) / (1024 * 1024))} MB
                และไม่เกิน {Number(process.env.NEXT_PUBLIC_ROOM_SCHEDULE_IMPORT_MAX_PAGES || 100)} หน้า ระบบตรวจชนิดไฟล์จริงก่อนอ่าน
              </p>
            </Upload.Dragger>
            {progress && (
              <Card size="small">
                <Typography.Text>{progress.status}</Typography.Text>
                {progress.pageCount > 0 && (
                  <Progress
                    percent={Math.floor((Math.max(0, progress.page - 1) / progress.pageCount) * 100)}
                    format={() => `กำลังอ่านหน้า ${progress.page} จาก ${progress.pageCount}`}
                  />
                )}
              </Card>
            )}
            <Space wrap>
              <Button type="primary" loading={working} disabled={!file} onClick={() => void readPdf()}>
                เริ่มอ่านตาราง
              </Button>
              <Button disabled={working} onClick={() => {
                setOpen(false);
                reset();
                onManualCreate();
              }}>
                กรอกตารางเอง
              </Button>
            </Space>
          </div>
        )}
        {stage === "REVIEW" && preview && (
          <div className="schedule-import-step">
            <Descriptions bordered size="small" column={{ xs: 1, sm: 2, md: 4 }}>
              <Descriptions.Item label="ไฟล์">{preview.fileName}</Descriptions.Item>
              <Descriptions.Item label="หน้า">{preview.pageCount}</Descriptions.Item>
              <Descriptions.Item label="อ่านสำเร็จ">{preview.successfulPages}</Descriptions.Item>
              <Descriptions.Item label="อ่านไม่สำเร็จ">{preview.failedPages.length}</Descriptions.Item>
              <Descriptions.Item label="ห้องที่พบ">{preview.roomCodes.length || "ไม่พบ"}</Descriptions.Item>
              <Descriptions.Item label="รายการ">{rows.length}</Descriptions.Item>
              <Descriptions.Item label="พร้อมนำเข้า">{validCount}</Descriptions.Item>
              <Descriptions.Item label="เลือกแล้ว">{selectedRows.length}</Descriptions.Item>
              <Descriptions.Item label="รายวิชาที่พบ">{new Set(rows.flatMap((row) => row.courseCode ? [row.courseCode] : [])).size}</Descriptions.Item>
              <Descriptions.Item label="มีกลุ่มเรียน">{rows.filter((row) => row.className).length}</Descriptions.Item>
              <Descriptions.Item label="มีชื่อครู">{rows.filter((row) => row.teacherName).length}</Descriptions.Item>
              <Descriptions.Item label="ต้องตรวจสอบ">{reviewCount}</Descriptions.Item>
              <Descriptions.Item label="รายการซ้ำ">{rows.filter((row) => row.duplicate).length}</Descriptions.Item>
            </Descriptions>
            {(preview.failedPages.length > 0 || preview.pageWarnings.length > 0) && (
              <Alert
                type="warning"
                showIcon
                message={`หน้าที่ต้องตรวจสอบ: ${[...preview.failedPages, ...preview.pageWarnings.map((warning) => warning.page)].filter((page, index, list) => list.indexOf(page) === index).join(", ") || "ไม่มี"}`}
                description={preview.pageWarnings.map((warning) => `หน้า ${warning.page}: ${warning.message}`).join(" · ") || "บางหน้าอ่านไม่สำเร็จ"}
              />
            )}
            <Alert
              type="warning"
              showIcon
              message="ผล OCR เป็นข้อมูลร่าง ไม่ใช่การยืนยันความถูกต้อง"
              description="ตรวจสอบห้อง วัน เวลา และรายละเอียดจาก PDF ต้นฉบับทุกครั้ง รายการที่อ่านข้อมูลหลักไม่ครบจะยังเลือกนำเข้าไม่ได้"
            />
            <Table<ImportRow>
              rowKey="id"
              size="small"
              bordered
              columns={columns}
              dataSource={rows}
              pagination={{ pageSize: 8, showSizeChanger: true, pageSizeOptions: [8, 20, 50] }}
              scroll={{ x: 1250 }}
              locale={{ emptyText: <Empty description="ไม่พบช่องตารางที่อ่านได้จาก PDF" /> }}
              rowSelection={{
                selectedRowKeys: selectedKeys,
                onChange: (keys) => setSelectedKeys(keys as string[]),
                getCheckboxProps: (row) => ({
                  disabled: row.duplicate || rowProblems(row).length > 0,
                }),
              }}
            />
            <Tabs
              items={[
                {
                  key: "cells",
                  label: "โครงสร้าง Cell",
                  children: (
                    <Table<PageCell>
                      rowKey="sourceCellKey"
                      size="small"
                      dataSource={pageExtraction?.cells ?? []}
                      pagination={{ pageSize: 10 }}
                      scroll={{ x: 900 }}
                      locale={{ emptyText: "เลือกหน้า PDF จากปุ่ม PDF ในรายการเพื่อตรวจโครงสร้าง Cell" }}
                      columns={[
                        { title: "Cell", dataIndex: "sourceCellKey" },
                        { title: "วัน", dataIndex: "dayOfWeek", render: (value: DayName | null) => value ? dayLabel[value] : "ต้องตรวจสอบ" },
                        { title: "คาบ", render: (_, cell) => `${cell.startPeriod}–${cell.endPeriod}` },
                        { title: "เวลา", render: (_, cell) => `${cell.startTime ?? "?"}–${cell.endTime ?? "?"}` },
                        { title: "ข้อความต้นฉบับ", dataIndex: "sourceCellText", render: (value: string) => value || "ช่องว่าง" },
                        { title: "สถานะ", dataIndex: "empty", render: (empty: boolean) => empty ? <Tag>ช่องว่าง</Tag> : <Tag color="blue">มีข้อความ</Tag> },
                      ]}
                    />
                  ),
                },
                {
                  key: "words",
                  label: "ข้อมูล OCR / Text Layer",
                  children: (
                    <Table<NormalizedWord>
                      rowKey={(word) => `${word.x}:${word.y}:${word.text}`}
                      size="small"
                      dataSource={pageExtraction?.rawWords ?? []}
                      pagination={{ pageSize: 12 }}
                      scroll={{ x: 800 }}
                      locale={{ emptyText: "เลือกหน้า PDF จากปุ่ม PDF ในรายการเพื่อดูข้อความดิบ" }}
                      columns={[
                        { title: "ข้อความดิบ", dataIndex: "text" },
                        { title: "ที่มา", dataIndex: "source", render: (value: string) => value === "OCR" ? "OCR" : "PDF Text Layer" },
                        { title: "ความมั่นใจ", dataIndex: "confidence", render: (value: number | null) => value === null ? "ไม่มีคะแนน" : `${value}%` },
                        { title: "ตำแหน่ง (x, y)", render: (_, word) => `${word.x.toFixed(4)}, ${word.y.toFixed(4)}` },
                        { title: "ขนาด (กว้าง × สูง)", render: (_, word) => `${word.width.toFixed(4)} × ${word.height.toFixed(4)}` },
                      ]}
                    />
                  ),
                },
                {
                  key: "catalog",
                  label: "ตารางรายวิชา",
                  children: (
                    <Table<CourseCatalogEntry>
                      rowKey="courseCode"
                      size="small"
                      dataSource={preview.courseCatalog}
                      pagination={false}
                      columns={[
                        { title: "รหัสวิชา", dataIndex: "courseCode" },
                        { title: "ข้อความต้นฉบับที่อยู่ใกล้รหัส", dataIndex: "sourceText" },
                        { title: "ข้อความชื่อวิชาที่อ่านได้", dataIndex: "subject", render: (value: string | null) => value ?? "ยังระบุไม่ได้" },
                        { title: "ความมั่นใจ", dataIndex: "confidence", render: (value: number | null) => value === null ? "ไม่มีคะแนน" : `${value}%` },
                      ]}
                    />
                  ),
                },
              ]}
            />
            <Space wrap>
              <Button onClick={() => setStage("SELECT")}>ย้อนกลับ</Button>
              <Button
                type="primary"
                loading={working}
                disabled={selectedRows.length === 0}
                onClick={() => void importSelected()}
              >
                ยืนยันนำเข้า {selectedRows.length} รายการ
              </Button>
            </Space>
          </div>
        )}
        {stage === "RESULT" && summary && (
          <div className="schedule-import-step">
            <Alert
              type={summary.failed ? "warning" : "success"}
              showIcon
              message={summary.failed ? "นำเข้าเสร็จแล้ว แต่มีบางรายการไม่สำเร็จ" : "ดำเนินการนำเข้าเสร็จแล้ว"}
            />
            <div className="schedule-import-statistics">
              <Card><Statistic title="นำเข้าสำเร็จ" value={summary.imported} /></Card>
              <Card><Statistic title="รายการซ้ำที่ข้าม" value={summary.duplicates} /></Card>
              <Card><Statistic title="ไม่สำเร็จ" value={summary.failed} /></Card>
            </div>
            {summary.results.filter((result) => result.status !== "IMPORTED").length > 0 && (
              <Table
                rowKey={(result) => `${result.sourcePage}:${result.status}:${result.message ?? ""}`}
                size="small"
                dataSource={summary.results.filter((result) => result.status !== "IMPORTED")}
                columns={[
                  { title: "หน้า", dataIndex: "sourcePage" },
                  { title: "สถานะ", dataIndex: "status" },
                  { title: "รายละเอียด", dataIndex: "message" },
                ]}
                pagination={false}
                scroll={{ x: 600 }}
              />
            )}
            <Space>
              <Button onClick={() => {
                setOpen(false);
                reset();
              }}>ปิด</Button>
              <Button onClick={reset}>นำเข้าไฟล์อื่น</Button>
            </Space>
          </div>
        )}
      </Modal>
      <Drawer
        title={editingRow ? `ตรวจสอบรายการ · หน้า ${editingRow.sourcePage}` : "ตรวจสอบรายการ"}
        open={Boolean(editingRow)}
        onClose={() => setEditingRow(null)}
        width={520}
        extra={<Button type="primary" onClick={() => void saveEditedRow()}>บันทึกการแก้</Button>}
        destroyOnHidden
      >
        {editingRow && (
          <>
            <Alert
              type="info"
              showIcon
              message="ข้อความต้นฉบับจากช่องตาราง"
              description={editingRow.sourceCellText || "ไม่มีข้อความที่ OCR อ่านได้"}
            />
            <Typography.Paragraph>
              <Button type="link" onClick={() => setPageToView(editingRow.sourcePage)}>เปิด PDF หน้า {editingRow.sourcePage}</Button>
              <Tag>{confidenceLabel(editingRow.sourceConfidence, preview?.confidenceThresholds ?? { confident: 80, review: 50 })}</Tag>
            </Typography.Paragraph>
            <Form<EditableRow> form={form} layout="vertical">
              <Form.Item name="roomId" label="ห้อง">
                <Select allowClear options={roomOptions} />
              </Form.Item>
              <Form.Item name="dayOfWeek" label="วัน">
                <Select allowClear options={days} />
              </Form.Item>
              <Space.Compact block>
                <Form.Item name="startTime" label="เวลาเริ่ม" className="schedule-import-half-field">
                  <Input type="time" />
                </Form.Item>
                <Form.Item name="endTime" label="เวลาสิ้นสุด" className="schedule-import-half-field">
                  <Input type="time" />
                </Form.Item>
              </Space.Compact>
              <Form.Item name="effectiveFrom" label="เริ่มใช้วันที่ (เว้นว่างหากไม่ระบุ)">
                <Input type="date" />
              </Form.Item>
              <Form.Item name="effectiveTo" label="สิ้นสุดวันที่">
                <Input type="date" />
              </Form.Item>
              <Form.Item name="courseCode" label="รหัสวิชา">
                <Input maxLength={50} />
              </Form.Item>
              <Form.Item name="subject" label="ชื่อวิชา / กิจกรรม">
                <Input maxLength={200} />
              </Form.Item>
              <Form.Item name="teacherName" label="ครูผู้สอน (เว้นว่างหากไม่มีข้อมูล)">
                <Input maxLength={200} />
              </Form.Item>
              <Form.Item name="className" label="กลุ่มเรียน">
                <Input maxLength={100} />
              </Form.Item>
              <Space.Compact block>
                <Form.Item name="semester" label="ภาคเรียน" className="schedule-import-half-field">
                  <Input maxLength={20} />
                </Form.Item>
                <Form.Item name="academicYear" label="ปีการศึกษา" className="schedule-import-half-field">
                  <Input maxLength={20} />
                </Form.Item>
              </Space.Compact>
            </Form>
          </>
        )}
      </Drawer>
      <Modal
        title={`PDF ต้นฉบับ · หน้า ${pageToView ?? ""}`}
        open={pageToView !== null}
        onCancel={() => setPageToView(null)}
        footer={null}
        width="94vw"
        destroyOnHidden
      >
        {fileUrl && pageToView !== null ? (
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.1fr) minmax(320px, 0.9fr)", gap: 16, minHeight: "70vh" }}>
            <iframe
              title={`PDF ต้นฉบับ หน้า ${pageToView}`}
              src={`${fileUrl}#page=${pageToView}`}
              className="schedule-import-pdf-viewer"
              style={{ width: "100%", height: "70vh" }}
            />
            <div>
              <Space wrap style={{ marginBottom: 12 }}>
                <Typography.Text strong>หน้าเอกสาร</Typography.Text>
                <Select
                  value={pageToView}
                  onChange={(page) => {
                    setPageToView(page);
                    setCellToView("");
                  }}
                  options={preview?.pages.map((page) => ({ value: page.page, label: `หน้า ${page.page}` })) ?? []}
                  style={{ width: 130 }}
                />
                <Tag>{pageExtraction?.textSource === "OCR" ? "OCR" : "PDF Text Layer"}</Tag>
                {pageExtraction?.gridDetected ? <Tag color="green">พบเส้นกริด</Tag> : <Tag color="orange">ไม่พบเส้นกริด</Tag>}
              </Space>
              <Tabs
                items={[
                  {
                    key: "cell",
                    label: "Cell ที่เลือก",
                    children: viewedCell ? (
                      <>
                        <Descriptions size="small" bordered column={1}>
                          <Descriptions.Item label="รหัส Cell">{viewedCell.sourceCellKey}</Descriptions.Item>
                          <Descriptions.Item label="วัน">{viewedCell.dayOfWeek ? dayLabel[viewedCell.dayOfWeek] : "ยังระบุไม่ได้"}</Descriptions.Item>
                          <Descriptions.Item label="คาบ">{viewedCell.startPeriod}–{viewedCell.endPeriod}</Descriptions.Item>
                          <Descriptions.Item label="เวลา">{viewedCell.startTime ?? "?"}–{viewedCell.endTime ?? "?"}</Descriptions.Item>
                          <Descriptions.Item label="กรอบตำแหน่ง (normalized)">
                            x={viewedCell.bounds.x.toFixed(4)}, y={viewedCell.bounds.y.toFixed(4)}, w={viewedCell.bounds.width.toFixed(4)}, h={viewedCell.bounds.height.toFixed(4)}
                          </Descriptions.Item>
                        </Descriptions>
                        <Typography.Paragraph style={{ marginTop: 12, whiteSpace: "pre-wrap" }}>
                          {viewedCell.sourceCellText || "ช่องนี้ว่างในต้นฉบับ"}
                        </Typography.Paragraph>
                        <Typography.Text type="secondary">
                          ไม่วาดกรอบทับบน PDF viewer เพราะตำแหน่งการเรนเดอร์ของ viewer ไม่สามารถยืนยันการแปลงพิกัดให้ตรงกับภาพต้นฉบับได้
                        </Typography.Text>
                      </>
                    ) : <Empty description="เลือกแถวเพื่อดู Cell ต้นฉบับ" />
                  },
                  {
                    key: "ocr",
                    label: "Raw text",
                    children: (
                      <Table<NormalizedWord>
                        rowKey={(word) => `${word.x}:${word.y}:${word.text}`}
                        size="small"
                        dataSource={pageExtraction?.rawWords ?? []}
                        pagination={{ pageSize: 10 }}
                        columns={[
                          { title: "ข้อความ", dataIndex: "text" },
                          { title: "ต้นทาง", dataIndex: "source" },
                          { title: "Confidence", dataIndex: "confidence", render: (value: number | null) => value === null ? "ไม่มี" : `${value}%` },
                        ]}
                      />
                    ),
                  },
                  {
                    key: "structured",
                    label: "Structured data",
                    children: (
                      <Table<ImportRow>
                        rowKey="id"
                        size="small"
                        dataSource={rows.filter((row) => row.sourcePage === pageToView)}
                        pagination={{ pageSize: 8 }}
                        columns={[
                          { title: "Cell", dataIndex: "sourceCellKey" },
                          { title: "วิชา", render: (_, row) => [row.courseCode, row.subject].filter(Boolean).join(" · ") || "ไม่มีข้อมูล" },
                          { title: "กลุ่ม", dataIndex: "className", render: (value: string | null) => value ?? "ไม่มีข้อมูล" },
                          { title: "ผู้สอน", dataIndex: "teacherName", render: (value: string | null) => value ?? "ไม่มีข้อมูล" },
                        ]}
                      />
                    ),
                  },
                ]}
              />
            </div>
          </div>
        ) : <Empty description="ไม่พบไฟล์ PDF ต้นฉบับในเครื่อง" />}
      </Modal>
    </>
  );
}
