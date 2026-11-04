"use client";

import { useState } from "react";
import { BookOutlined, SearchOutlined } from "@ant-design/icons";
import { Alert, Button, Card, Input, Space, Typography } from "antd";

type Course = { courseCode: string; courseName: string };

export function CourseSearch() {
  const [courseCode, setCourseCode] = useState("");
  const [course, setCourse] = useState<Course | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);

  const search = async () => {
    setLoading(true);
    setSearched(true);
    setCourse(null);
    setMessage(null);
    try {
      const params = new URLSearchParams({ courseCode });
      const response = await fetch(`/api/courses?${params}`, { cache: "no-store" });
      const body = await response.json() as { success: boolean; message?: string; data?: Course };
      if (!response.ok || !body.success || !body.data) {
        setMessage(body.message ?? "ค้นหารายวิชาไม่สำเร็จ");
        return;
      }
      setCourse(body.data);
    } catch {
      setMessage("เชื่อมต่อฐานข้อมูลเพื่อค้นหารายวิชาไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="dashboard-content">
      <div className="welcome-row">
        <div>
          <p className="eyebrow">COURSE CATALOGUE</p>
          <h1>ค้นหารายวิชา</h1>
          <p className="welcome-subtitle">ค้นหาชื่อวิชาจากรหัสในฐานข้อมูลรายวิชา</p>
        </div>
      </div>
      <Card>
        <Space.Compact style={{ width: "100%", maxWidth: 640 }}>
          <Input
            aria-label="รหัสวิชา"
            placeholder="เช่น 21910-2021"
            value={courseCode}
            onChange={(event) => setCourseCode(event.target.value)}
            onPressEnter={() => void search()}
          />
          <Button type="primary" icon={<SearchOutlined />} loading={loading} onClick={() => void search()}>
            ค้นหา
          </Button>
        </Space.Compact>
      </Card>
      {searched && course && (
        <Card style={{ marginTop: 16 }}>
          <Space align="start">
            <BookOutlined style={{ fontSize: 24, color: "#1677ff", marginTop: 4 }} />
            <div>
              <Typography.Text type="secondary">{course.courseCode}</Typography.Text>
              <Typography.Title level={3} style={{ margin: "4px 0 0" }}>{course.courseName}</Typography.Title>
            </div>
          </Space>
        </Card>
      )}
      {searched && message && <Alert style={{ marginTop: 16 }} type="warning" showIcon message={message} />}
    </div>
  );
}
