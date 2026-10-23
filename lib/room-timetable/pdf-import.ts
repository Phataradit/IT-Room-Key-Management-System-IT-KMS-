import { createHash } from "node:crypto";
import { copyFile, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createCanvas, type Canvas } from "@napi-rs/canvas";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { createWorker, type Worker } from "tesseract.js";
import { DayOfWeek } from "@prisma/client";

const maximumUploadBytes = Number(process.env.NEXT_PUBLIC_ROOM_SCHEDULE_IMPORT_MAX_BYTES ?? 25 * 1024 * 1024);
const maximumPages = Number(process.env.NEXT_PUBLIC_ROOM_SCHEDULE_IMPORT_MAX_PAGES ?? 100);
const renderPixelLimit = 12_000_000;
const confidenceThresholds = {
  confident: Number(process.env.ROOM_SCHEDULE_IMPORT_CONFIDENCE_HIGH ?? 80),
  review: Number(process.env.ROOM_SCHEDULE_IMPORT_CONFIDENCE_LOW ?? 50),
};
const dayLabels = new Map<string, DayOfWeek>([
  ["วันจันทร์", DayOfWeek.MONDAY],
  ["วันอังคาร", DayOfWeek.TUESDAY],
  ["วันพุธ", DayOfWeek.WEDNESDAY],
  ["วันพฤหัสบดี", DayOfWeek.THURSDAY],
  ["วันศุกร์", DayOfWeek.FRIDAY],
  ["วันเสาร์", DayOfWeek.SATURDAY],
  ["วันอาทิตย์", DayOfWeek.SUNDAY],
]);
const weekdayOrder = [...dayLabels.values()];
const knownRoomCodes = new Set([
  "243", "251", "252", "253", "423", "424", "733", "751",
  "752", "821", "831", "832", "841", "851", "862",
]);

type PdfWord = {
  text: string;
  confidence: number | null;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  source: "PDF_TEXT" | "OCR";
};

type NormalizedPdfWord = Omit<PdfWord, "x0" | "y0" | "x1" | "y1"> & {
  x: number;
  y: number;
  width: number;
  height: number;
};

type CellBounds = { x: number; y: number; width: number; height: number };

type RoomSchedulePdfCell = {
  sourceCellKey: string;
  dayOfWeek: DayOfWeek | null;
  startPeriod: number;
  endPeriod: number;
  startTime: string | null;
  endTime: string | null;
  sourceCellText: string;
  sourceConfidence: number | null;
  bounds: CellBounds;
  words: NormalizedPdfWord[];
  empty: boolean;
};

type CourseCatalogEntry = {
  courseCode: string;
  subject: string | null;
  sourceText: string;
  confidence: number | null;
  bounds: CellBounds;
};

type PageExtraction = {
  page: number;
  width: number;
  height: number;
  textSource: "PDF_TEXT" | "OCR";
  gridDetected: boolean;
  grid: { x: number[]; y: number[] } | null;
  periods: Array<{ period: number; startTime: string | null; endTime: string | null }>;
  cells: RoomSchedulePdfCell[];
  rawWords: NormalizedPdfWord[];
};

export type RoomSchedulePdfPreviewRow = {
  sourcePage: number;
  sourceCellKey: string;
  sourceCellText: string;
  sourceConfidence: number | null;
  sourceBounds: CellBounds;
  sourceWords: NormalizedPdfWord[];
  sourceStructured: {
    courseCode: string | null;
    subject: string | null;
    teacherName: string | null;
    className: string | null;
    dayOfWeek: DayOfWeek | null;
    startTime: string | null;
    endTime: string | null;
    semester: string | null;
    academicYear: string | null;
  };
  sourceBuilding: string | null;
  roomCode: string | null;
  roomId: string | null;
  roomSource: "PDF_TEXT" | "OCR" | "FILE_NAME" | null;
  dayOfWeek: DayOfWeek | null;
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

export type RoomSchedulePdfPreview = {
  fileName: string;
  fileHash: string;
  pageCount: number;
  successfulPages: number;
  failedPages: number[];
  pageWarnings: Array<{ page: number; message: string }>;
  confidenceThresholds: typeof confidenceThresholds;
  roomCodes: string[];
  courseCatalog: CourseCatalogEntry[];
  pages: PageExtraction[];
  rows: RoomSchedulePdfPreviewRow[];
};

type ProgressUpdate = {
  page: number;
  pageCount: number;
  status: "READING_TEXT" | "RUNNING_OCR" | "EXTRACTING_CELLS";
};

function normalizeDigits(value: string) {
  return value.replace(/[๐-๙]/g, (digit) => String("๐๑๒๓๔๕๖๗๘๙".indexOf(digit)));
}

function compact(value: string) {
  return normalizeDigits(value).replace(/\s+/g, "").replace(/[|()[\]{}]/g, "");
}

function normalizeWord(word: PdfWord, width: number, height: number): NormalizedPdfWord {
  return {
    text: word.text,
    confidence: word.confidence,
    source: word.source,
    x: word.x0 / width,
    y: word.y0 / height,
    width: (word.x1 - word.x0) / width,
    height: (word.y1 - word.y0) / height,
  };
}

function deduplicateWords(words: PdfWord[]) {
  const unique: PdfWord[] = [];
  for (const word of words) {
    const duplicate = unique.some((candidate) =>
      candidate.text === word.text
      && Math.abs(candidate.x0 - word.x0) < 2
      && Math.abs(candidate.y0 - word.y0) < 2
      && Math.abs(candidate.x1 - word.x1) < 2
      && Math.abs(candidate.y1 - word.y1) < 2);
    if (!duplicate) unique.push(word);
  }
  return unique;
}

function groupPeaks(scores: number[], threshold: number, radius: number) {
  const result: Array<{ position: number; score: number }> = [];
  for (let index = 1; index < scores.length - 1; index += 1) {
    if (scores[index] < threshold || scores[index] < scores[index - 1] || scores[index] < scores[index + 1]) continue;
    const previous = result.at(-1);
    if (previous && index - previous.position <= radius) {
      if (scores[index] > previous.score) Object.assign(previous, { position: index, score: scores[index] });
    } else {
      result.push({ position: index, score: scores[index] });
    }
  }
  return result;
}

function detectGrid(canvas: Canvas) {
  const { width, height } = canvas;
  const pixels = canvas.getContext("2d").getImageData(0, 0, width, height).data;
  const dark = (x: number, y: number) => {
    const offset = (y * width + x) * 4;
    return Math.max(pixels[offset], pixels[offset + 1], pixels[offset + 2]) < 155;
  };
  const periodTop = Math.round(height * 0.35);
  const periodBottom = Math.round(height * 0.45);
  const verticalScores = Array.from({ length: width }, (_, x) => {
    let score = 0;
    for (let y = periodTop; y < periodBottom; y += 1) if (dark(x, y)) score += 1;
    return score;
  });
  const verticalCandidates = groupPeaks(
    verticalScores,
    Math.round((periodBottom - periodTop) * 0.38),
    Math.max(3, Math.round(width * 0.002)),
  ).filter(({ position }) => position >= width * 0.14 && position <= width * 0.98);
  const xBoundaries = verticalCandidates
    .filter(({ position }) => position >= width * 0.14)
    .sort((left, right) => right.score - left.score)
    .slice(0, 30)
    .sort((left, right) => left.position - right.position)
    .map(({ position }) => position);

  const horizontalLeft = Math.round(width * 0.15);
  const horizontalRight = Math.round(width * 0.97);
  const horizontalScores = Array.from({ length: height }, (_, y) => {
    let score = 0;
    for (let x = horizontalLeft; x < horizontalRight; x += 1) if (dark(x, y)) score += 1;
    return score;
  });
  const horizontalCandidates = groupPeaks(
    horizontalScores,
    Math.round((horizontalRight - horizontalLeft) * 0.12),
    Math.max(3, Math.round(height * 0.003)),
  ).filter(({ position }) => position >= height * 0.43 && position <= height * 0.91);
  const yBoundaries = horizontalCandidates
    .sort((left, right) => right.score - left.score)
    .slice(0, 8)
    .sort((left, right) => left.position - right.position)
    .map(({ position }) => position);

  if (xBoundaries.length < 3 || yBoundaries.length !== 8) return null;
  if (xBoundaries.some((position, index) => index > 0 && position - xBoundaries[index - 1] < width * 0.025)) return null;
  if (yBoundaries.some((position, index) => index > 0 && position - yBoundaries[index - 1] < height * 0.025)) return null;
  return { xBoundaries, yBoundaries, width, height, dark };
}

function textItemsToWords(items: Array<{ str: string; transform: number[]; width: number; height: number }>, viewport: {
  width: number;
  height: number;
  scale: number;
  convertToViewportPoint: (x: number, y: number) => number[];
}): PdfWord[] {
  return items.flatMap((item) => {
    const text = item.str.trim();
    if (!text) return [];
    const point = viewport.convertToViewportPoint(item.transform[4], item.transform[5]);
    const x0 = point[0] ?? 0;
    const baseline = point[1] ?? 0;
    return [{
      text,
      confidence: null,
      x0,
      y0: baseline - item.height * viewport.scale,
      x1: x0 + item.width * viewport.scale,
      y1: baseline,
      source: "PDF_TEXT",
    }];
  });
}

function ocrWordsToWords(workerData: Awaited<ReturnType<Worker["recognize"]>>["data"]): PdfWord[] {
  return workerData.blocks?.flatMap((block) =>
    block.paragraphs.flatMap((paragraph) =>
      paragraph.lines.flatMap((line) =>
        line.words.map((word) => ({
          text: word.text,
          confidence: word.confidence,
          x0: word.bbox.x0,
          y0: word.bbox.y0,
          x1: word.bbox.x1,
          y1: word.bbox.y1,
          source: "OCR",
        })),
      ),
    ),
  ) ?? [];
}

async function recognizeCropWords(
  worker: Worker,
  canvas: Canvas,
  crop: { x: number; y: number; width: number; height: number },
): Promise<PdfWord[]> {
  const scale = 2;
  const croppedCanvas = createCanvas(Math.ceil(crop.width * scale), Math.ceil(crop.height * scale));
  croppedCanvas.getContext("2d").drawImage(
    canvas,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    croppedCanvas.width,
    croppedCanvas.height,
  );
  const recognized = await worker.recognize(croppedCanvas.toBuffer("image/png"), {}, { blocks: true });
  return ocrWordsToWords(recognized.data).map((word) => ({
    ...word,
    x0: crop.x + word.x0 / scale,
    y0: crop.y + word.y0 / scale,
    x1: crop.x + word.x1 / scale,
    y1: crop.y + word.y1 / scale,
  }));
}

function findDayLabel(words: PdfWord[], leftBoundary: number, top: number, bottom: number, height: number) {
  const labelWords = words
    .filter((word) => (word.x0 + word.x1) / 2 < leftBoundary && (word.y0 + word.y1) / 2 >= top && (word.y0 + word.y1) / 2 < bottom)
    .sort((left, right) => left.x0 - right.x0);
  const text = compact(labelWords.map((word) => word.text).join(""));
  const consonants = text.replace(/[\u0E30-\u0E3A\u0E40-\u0E4E]/gu, "");
  for (const [label, day] of dayLabels) {
    const labelConsonants = compact(label.replace(/^วัน/u, "")).replace(/[\u0E30-\u0E3A\u0E40-\u0E4E]/gu, "");
    if (text.includes(label) || consonants.includes(labelConsonants)) return day;
  }
  const midY = (top + bottom) / 2;
  const nearby = words
    .filter((word) => (word.x0 + word.x1) / 2 < leftBoundary && Math.abs((word.y0 + word.y1) / 2 - midY) < height * 0.025)
    .map((word) => compact(word.text))
    .join("");
  const nearbyConsonants = nearby.replace(/[\u0E30-\u0E3A\u0E40-\u0E4E]/gu, "");
  for (const [label, day] of dayLabels) {
    const labelConsonants = compact(label.replace(/^วัน/u, "")).replace(/[\u0E30-\u0E3A\u0E40-\u0E4E]/gu, "");
    if (nearby.includes(label.replace("วัน", "")) || nearbyConsonants.includes(labelConsonants)) return day;
  }
  return null;
}

function findRoomCode(words: PdfWord[], pageWidth: number, pageHeight: number) {
  const headerWords = words.filter((word) => {
    const centerX = (word.x0 + word.x1) / 2;
    const centerY = (word.y0 + word.y1) / 2;
    return centerX < pageWidth * 0.28 && centerY > pageHeight * 0.17 && centerY < pageHeight * 0.38;
  });
  const roomCandidates = headerWords
    .filter((word) => {
      const centerY = (word.y0 + word.y1) / 2;
      return centerY >= pageHeight * 0.27 && centerY <= pageHeight * 0.36;
    })
    .flatMap((word) => normalizeDigits(word.text).match(/\d{3}/g) ?? [])
    .filter((code) => knownRoomCodes.has(code));
  const uniqueCandidates = [...new Set(roomCandidates)];
  if (uniqueCandidates.length === 1) return uniqueCandidates[0];

  const compactHeader = compact(headerWords.map((word) => word.text).join(""));
  const headerCandidates = [...knownRoomCodes].filter((code) => compactHeader.includes(code));
  return headerCandidates.length === 1 ? headerCandidates[0] : null;
}

function readHeaderValue(words: PdfWord[], grid: NonNullable<ReturnType<typeof detectGrid>>) {
  const header = words
    .filter((word) => word.y0 < grid.height * 0.36)
    .map((word) => word.text)
    .join(" ");
  const normalized = compact(header);
  const semesterMatch = normalized.includes("ภาคเรียน")
    ? normalized.match(/ภาคเรียนที่?([1-3])[/\-](25\d{2})/)
    : null;
  const buildingMatch = normalized.includes("อาคาร")
    ? normalized.match(/อาคาร(?:เรียน)?(?:อาคาร)?(\d+)/)
    : null;
  return {
    semester: semesterMatch?.[1] ?? null,
    academicYear: semesterMatch?.[2] ?? null,
    building: buildingMatch?.[1] ?? null,
  };
}

function getPeriodTimes(words: PdfWord[], grid: NonNullable<ReturnType<typeof detectGrid>>) {
  const headerWords = words.filter((word) => {
    const y = (word.y0 + word.y1) / 2;
    return y >= grid.height * 0.34 && y < grid.yBoundaries[0];
  });
  const timeMarks = headerWords.flatMap((word) => {
    const normalized = normalizeDigits(word.text);
    return [...normalized.matchAll(
      /(?:^|[^\d])(\d{1,2})[:.](\d{2})(?!\d)|(?<!\d)(\d{1,2})(\d{2})\3\4(?!\d)|(?<!\d)(\d{3,4})(?!\d)/g,
    )]
      .flatMap((match) => {
        const compactTime = match[5];
        const hour = match[3] ?? (compactTime ? compactTime.slice(0, -2) : match[1]);
        const minute = match[4] ?? (compactTime ? compactTime.slice(-2) : match[2]);
        if (Number(hour) >= 24 || Number(minute) >= 60 || Number(minute) % 15 !== 0) return [];
        const textIndex = match.index ?? 0;
        const matchLength = match[0].length;
        const x = word.x0 + ((textIndex + matchLength / 2) / normalized.length) * (word.x1 - word.x0);
        return [{ time: `${hour.padStart(2, "0")}:${minute}`, x }];
      });
  });
  const separators = headerWords.flatMap((word) => {
    if (!/^[-–—]+$/.test(word.text.trim())) return [];
    return [{ x: (word.x0 + word.x1) / 2 }];
  });
  const periods: Array<{ startTime: string; endTime: string } | null> = Array(grid.xBoundaries.length - 1).fill(null);
  for (const separator of separators) {
    const beforeCandidates = timeMarks
      .filter((mark) => mark.x < separator.x)
      .sort((first, second) => second.x - first.x);
    const afterCandidates = timeMarks
      .filter((mark) => mark.x > separator.x)
      .sort((first, second) => first.x - second.x);
    const before = beforeCandidates.find((candidate) =>
      afterCandidates.some((after) => candidate.time < after.time));
    const after = before
      ? afterCandidates.find((candidate) => before.time < candidate.time)
      : undefined;
    if (!before || !after || before.time >= after.time) continue;
    const periodIndex = grid.xBoundaries.findIndex((left, index) =>
      index < grid.xBoundaries.length - 1
      && separator.x >= left
      && separator.x <= grid.xBoundaries[index + 1]);
    if (periodIndex >= 0 && periodIndex < periods.length) {
      periods[periodIndex] = { startTime: before.time, endTime: after.time };
    }
  }
  return periods;
}

function extractCourseCatalog(words: PdfWord[], grid: NonNullable<ReturnType<typeof detectGrid>>) {
  const catalog = new Map<string, CourseCatalogEntry>();
  for (const codeWord of words) {
    const y = (codeWord.y0 + codeWord.y1) / 2;
    if (y >= grid.yBoundaries[0] * 0.78 || codeWord.x0 > grid.width * 0.62) continue;
    const code = normalizeDigits(codeWord.text).match(/\b\d{5}-\d{4}\b/)?.[0];
    if (!code || catalog.has(code)) continue;
    const sameRowWords = words
      .filter((word) => {
        const wordY = (word.y0 + word.y1) / 2;
        return Math.abs(wordY - y) < grid.height * 0.012
          && word.x0 >= codeWord.x0
          && word.x0 < codeWord.x0 + grid.width * 0.42
          && /[\p{L}]/u.test(word.text)
          && !/\d{5}-\d{4}/.test(word.text);
      })
      .sort((left, right) => left.x0 - right.x0)
      .filter((word) => word.text.trim());
    const subject = sameRowWords.map((word) => word.text.trim()).join(" ").trim();
    const rowWords = [codeWord, ...sameRowWords];
    const bounds = {
      x: Math.min(...rowWords.map((word) => word.x0)) / grid.width,
      y: Math.min(...rowWords.map((word) => word.y0)) / grid.height,
      width: (Math.max(...rowWords.map((word) => word.x1)) - Math.min(...rowWords.map((word) => word.x0))) / grid.width,
      height: (Math.max(...rowWords.map((word) => word.y1)) - Math.min(...rowWords.map((word) => word.y0))) / grid.height,
    };
    const confidences = rowWords.flatMap((word) => word.confidence === null ? [] : [word.confidence]);
    catalog.set(code, {
      courseCode: code,
      subject: subject || null,
      sourceText: rowWords.map((word) => word.text).join(" "),
      confidence: confidences.length
        ? Math.round(confidences.reduce((sum, value) => sum + value, 0) / confidences.length)
        : null,
      bounds,
    });
  }
  return [...catalog.values()];
}

function groupWordsIntoLines(words: PdfWord[], pageHeight: number) {
  const lines: Array<{ centerY: number; words: PdfWord[] }> = [];
  const tolerance = Math.max(3, pageHeight * 0.009);
  for (const word of [...words].sort((first, second) =>
    (first.y0 + first.y1) / 2 - (second.y0 + second.y1) / 2 || first.x0 - second.x0)) {
    const centerY = (word.y0 + word.y1) / 2;
    let line = lines.find((candidate) => Math.abs(candidate.centerY - centerY) <= tolerance);
    if (!line) {
      line = { centerY, words: [] };
      lines.push(line);
    }
    line.words.push(word);
    line.centerY = line.words.reduce((sum, item) => sum + (item.y0 + item.y1) / 2, 0) / line.words.length;
  }
  return lines
    .sort((first, second) => first.centerY - second.centerY)
    .map((line) => line.words.sort((first, second) => first.x0 - second.x0).map((word) => word.text).join(" ").trim());
}

function makePageCells(
  words: PdfWord[],
  grid: NonNullable<ReturnType<typeof detectGrid>>,
  periods: Array<{ startTime: string; endTime: string } | null>,
  header: ReturnType<typeof readHeaderValue>,
  roomCode: string | null,
  roomSource: RoomSchedulePdfPreviewRow["roomSource"],
  page: number,
): { cells: RoomSchedulePdfCell[]; rows: RoomSchedulePdfPreviewRow[]; courseCatalog: CourseCatalogEntry[] } {
  const cells: RoomSchedulePdfCell[] = [];
  const rows: RoomSchedulePdfPreviewRow[] = [];
  const courseCatalog = extractCourseCatalog(words, grid);
  const detectedDays = Array.from({ length: 7 }, (_, dayIndex) =>
    findDayLabel(words, grid.xBoundaries[0], grid.yBoundaries[dayIndex], grid.yBoundaries[dayIndex + 1], grid.height));
  const hasDetectedDay = detectedDays.some(Boolean);
  const matchesWeekdayOrder = hasDetectedDay
    && detectedDays.every((day, index) => day === null || day === weekdayOrder[index])
    && new Set(detectedDays.filter(Boolean)).size === detectedDays.filter(Boolean).length;
  for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
    const top = grid.yBoundaries[dayIndex];
    const bottom = grid.yBoundaries[dayIndex + 1];
    const dayOfWeek = detectedDays[dayIndex] ?? (matchesWeekdayOrder ? weekdayOrder[dayIndex] : null);
    const activeBoundaries = grid.xBoundaries
      .map((x, index) => {
        let darkCount = 0;
        const sampleCount = Math.max(1, bottom - top - 8);
        for (let y = top + 4; y < bottom - 4; y += 1) {
          if (grid.dark(x, y) || grid.dark(x - 1, y) || grid.dark(x + 1, y)) darkCount += 1;
        }
        return { index, x, ratio: darkCount / sampleCount };
      })
      .filter((candidate) => candidate.ratio >= 0.48);

    for (let boundaryIndex = 0; boundaryIndex < activeBoundaries.length - 1; boundaryIndex += 1) {
      const left = activeBoundaries[boundaryIndex];
      const right = activeBoundaries[boundaryIndex + 1];
      if (right.index <= left.index) continue;
      const sourceCellKey = `${dayOfWeek ?? `ROW_${dayIndex + 1}`}:${left.index + 1}-${right.index}`;
      const cellWords = words
        .filter((word) => {
          const centerX = (word.x0 + word.x1) / 2;
          const centerY = (word.y0 + word.y1) / 2;
          return centerY >= top + 2
            && centerY <= bottom - 2
            && centerX >= left.x
            && centerX <= right.x
            && /[\p{L}\p{N}]/u.test(word.text);
        })
        .sort((first, second) => first.y0 - second.y0 || first.x0 - second.x0);
      const sourceLines = groupWordsIntoLines(cellWords, grid.height);
      const sourceCellText = sourceLines.join("\n").trim();
      const bounds = {
        x: left.x / grid.width,
        y: top / grid.height,
        width: (right.x - left.x) / grid.width,
        height: (bottom - top) / grid.height,
      };
      const confidences = cellWords.flatMap((word) => word.confidence === null ? [] : [word.confidence]);
      const sourceConfidence = confidences.length
        ? Math.round(confidences.reduce((sum, value) => sum + value, 0) / confidences.length)
        : null;
      const startPeriod = left.index;
      const endPeriod = right.index - 1;
      const startTime = periods[startPeriod]?.startTime ?? null;
      const endTime = periods[endPeriod]?.endTime ?? null;
      const cell: RoomSchedulePdfCell = {
        sourceCellKey,
        dayOfWeek,
        startPeriod: startPeriod + 1,
        endPeriod: endPeriod + 1,
        startTime,
        endTime,
        sourceCellText,
        sourceConfidence,
        bounds,
        words: cellWords.map((word) => normalizeWord(word, grid.width, grid.height)),
        empty: sourceCellText.length === 0,
      };
      cells.push(cell);
      if (cell.empty) continue;

      const compactText = normalizeDigits(sourceCellText).replace(/\s+/g, "");
      const courseCode = compactText.match(/\d{5}-\d{4}/)?.[0] ?? null;
      const rawGroupCode = sourceLines
        .filter((line) => !/\d{5}-\d{4}/.test(normalizeDigits(line)))
        .map((line) => normalizeDigits(line).replace(/\s+/g, "").match(/(?:[ก-๙A-Za-z]{1,8}\.|\.?)\d{1,3}/u)?.[0] ?? null)
        .find(Boolean) ?? null;
      const groupCode = rawGroupCode?.replace(/^\./, "") ?? null;
      const groupLineIndex = rawGroupCode ? sourceLines.findIndex((line) => normalizeDigits(line).replace(/\s+/g, "").includes(rawGroupCode)) : -1;
      const teacherLine = sourceLines.slice(groupLineIndex + 1)
        .map((line) => line.trim())
        .find((line) => /[\u0E00-\u0E7F]/u.test(line) && !/\p{N}/u.test(line)) ?? null;
      const catalogEntry = courseCode ? courseCatalog.find((entry) => entry.courseCode === courseCode) : null;
      rows.push({
      sourcePage: page,
      sourceCellKey,
      sourceCellText,
      sourceConfidence,
      sourceBounds: bounds,
      sourceWords: cell.words,
      sourceStructured: {
        courseCode,
        subject: catalogEntry?.subject ?? null,
        teacherName: teacherLine,
        className: groupCode,
        dayOfWeek,
        startTime,
        endTime,
        semester: header.semester,
        academicYear: header.academicYear,
      },
      sourceBuilding: header.building,
      roomCode,
      roomId: null,
      roomSource,
      dayOfWeek: cell.dayOfWeek,
      startTime,
      endTime,
      courseCode,
      subject: catalogEntry?.subject ?? null,
      teacherName: null,
      className: groupCode,
      semester: header.semester,
      academicYear: header.academicYear,
      effectiveFrom: null,
      effectiveTo: null,
      duplicate: false,
    });
    }
  }
  return { cells, rows, courseCatalog };
}

async function createLocalOcrWorker() {
  const langDirectory = await mkdtemp(path.join(os.tmpdir(), "it-kms-tessdata-"));
  try {
    for (const language of ["eng", "tha"]) {
      const packageDirectory = path.join(process.cwd(), "node_modules", "@tesseract.js-data", language);
      await copyFile(
        path.join(packageDirectory, "4.0.0", `${language}.traineddata.gz`),
        path.join(langDirectory, `${language}.traineddata.gz`),
      );
    }
    const worker = await createWorker("tha+eng", 1, {
      langPath: langDirectory,
      cacheMethod: "none",
      logger: () => {},
    });
    return { worker, langDirectory };
  } catch (error) {
    await rm(langDirectory, { recursive: true, force: true });
    throw error;
  }
}

export async function inspectRoomSchedulePdf(
  bytes: Uint8Array,
  fileName: string,
  onProgress: (update: ProgressUpdate) => void,
): Promise<RoomSchedulePdfPreview> {
  if (!Number.isSafeInteger(maximumUploadBytes) || maximumUploadBytes < 1
    || !Number.isSafeInteger(maximumPages) || maximumPages < 1
    || !Number.isFinite(confidenceThresholds.confident) || confidenceThresholds.confident < 0 || confidenceThresholds.confident > 100
    || !Number.isFinite(confidenceThresholds.review) || confidenceThresholds.review < 0 || confidenceThresholds.review > confidenceThresholds.confident) {
    throw new Error("การตั้งค่าข้อจำกัด PDF หรือระดับความมั่นใจไม่ถูกต้อง");
  }
  if (bytes.byteLength > maximumUploadBytes) throw new Error("ไฟล์มีขนาดเกินกำหนด");
  if (bytes.byteLength < 8 || new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") {
    throw new Error("ไฟล์นี้ไม่ใช่ PDF ที่ถูกต้อง");
  }
  const fileHash = createHash("sha256").update(bytes).digest("hex");
  const loadingTask = getDocument({
    data: bytes,
    maxImageSize: renderPixelLimit,
    canvasMaxAreaInBytes: renderPixelLimit * 4,
  });
  const document = await loadingTask.promise;
  const pageCount = document.numPages;
  if (pageCount < 1 || pageCount > maximumPages) {
    await loadingTask.destroy();
    throw new Error(`จำนวนหน้าต้องอยู่ระหว่าง 1 ถึง ${maximumPages} หน้า`);
  }

  const pagesFailed: number[] = [];
  const pageWarnings: RoomSchedulePdfPreview["pageWarnings"] = [];
  const rows: RoomSchedulePdfPreviewRow[] = [];
  const pages: PageExtraction[] = [];
  const courseCatalog = new Map<string, CourseCatalogEntry>();
  const filenameCandidate = path.basename(fileName, path.extname(fileName)).match(/^\d{3}$/)?.[0] ?? null;
  const filenameRoomCode = filenameCandidate && knownRoomCodes.has(filenameCandidate) ? filenameCandidate : null;
  let worker: Worker | null = null;
  let tessdataDirectory: string | null = null;
  let successfulPages = 0;

  try {
    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      onProgress({ page: pageNumber, pageCount, status: "READING_TEXT" });
      try {
        const page = await document.getPage(pageNumber);
        const baseViewport = page.getViewport({ scale: 1 });
        const scale = Math.min(
          3,
          3000 / Math.max(baseViewport.width, baseViewport.height),
          Math.sqrt(renderPixelLimit / (baseViewport.width * baseViewport.height)),
        );
        const viewport = page.getViewport({ scale });
        const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
        await page.render({
          canvas: canvas as unknown as HTMLCanvasElement,
          canvasContext: canvas.getContext("2d") as unknown as CanvasRenderingContext2D,
          viewport,
        }).promise;
        const grid = detectGrid(canvas);
        const textContent = await page.getTextContent();
        const sourceTextItems = textContent.items.flatMap((item) => {
          if (!("str" in item) || typeof item.str !== "string" || !item.str.trim()
            || !("transform" in item) || !Array.isArray(item.transform)
            || !("width" in item) || typeof item.width !== "number"
            || !("height" in item) || typeof item.height !== "number") return [];
          return [{
            str: item.str,
            transform: item.transform,
            width: item.width,
            height: item.height,
          }];
        });
        const sourceTextWords = textItemsToWords(sourceTextItems, viewport);
        let words = sourceTextWords;
        let roomSource: RoomSchedulePdfPreviewRow["roomSource"] = "PDF_TEXT";
        if (sourceTextWords.length < 20) {
          onProgress({ page: pageNumber, pageCount, status: "RUNNING_OCR" });
          if (!worker) {
            const local = await createLocalOcrWorker();
            worker = local.worker;
            tessdataDirectory = local.langDirectory;
          }
          const recognized = await worker.recognize(canvas.toBuffer("image/png"), {}, { blocks: true });
          words = ocrWordsToWords(recognized.data);
          roomSource = "OCR";
        }
        onProgress({ page: pageNumber, pageCount, status: "EXTRACTING_CELLS" });
        let extractionWords = words;
        if (grid && roomSource === "OCR" && worker) {
          const roomCrop = await recognizeCropWords(worker, canvas, {
            x: canvas.width * 0.04,
            y: canvas.height * 0.20,
            width: canvas.width * 0.24,
            height: canvas.height * 0.18,
          });
          extractionWords = [...extractionWords, ...roomCrop];
        }
        if (roomSource === "OCR" && worker) {
          const courseCrop = await recognizeCropWords(worker, canvas, {
            x: canvas.width * 0.25,
            y: canvas.height * 0.04,
            width: canvas.width * 0.72,
            height: canvas.height * 0.34,
          });
          extractionWords = [...extractionWords, ...courseCrop];
        }
        extractionWords = deduplicateWords(extractionWords);
        if (!grid) {
          pageWarnings.push({ page: pageNumber, message: "ตรวจไม่พบเส้นแบ่งวันหรือคาบครบ จึงไม่สร้างรายการจากหน้านี้" });
          pages.push({
            page: pageNumber,
            width: canvas.width,
            height: canvas.height,
            textSource: roomSource,
            gridDetected: false,
            grid: null,
            periods: [],
            cells: [],
            rawWords: extractionWords.map((word) => normalizeWord(word, canvas.width, canvas.height)),
          });
          successfulPages += 1;
          page.cleanup();
          continue;
        }
        const detectedRoom = filenameRoomCode
          ? { value: filenameRoomCode, source: "FILE_NAME" as const }
          : { value: findRoomCode(extractionWords, grid.width, grid.height), source: roomSource };
        const header = readHeaderValue(extractionWords, grid);
        if (detectedRoom.value) header.building = detectedRoom.value[0];
        let periods = getPeriodTimes(words, grid);
        if (roomSource === "OCR" && worker) {
          const timeCrop = await recognizeCropWords(worker, canvas, {
            x: canvas.width * 0.03,
            y: canvas.height * 0.35,
            width: canvas.width * 0.94,
            height: canvas.height * 0.07,
          });
          const croppedPeriods = getPeriodTimes(timeCrop, grid);
          if (croppedPeriods.filter(Boolean).length >= periods.filter(Boolean).length) {
            periods = croppedPeriods;
          }
        }
        const extracted = makePageCells(
          extractionWords,
          grid,
          periods,
          header,
          detectedRoom.value,
          detectedRoom.source,
          pageNumber,
        );
        if (extracted.rows.some((row) => !row.startTime || !row.endTime)) {
          pageWarnings.push({ page: pageNumber, message: "อ่านช่วงเวลาของบางรายการไม่ได้ กรุณาตรวจและแก้เวลาแต่ละรายการก่อนนำเข้า" });
        }
        if (extracted.rows.some((row) => !row.dayOfWeek)) {
          pageWarnings.push({ page: pageNumber, message: "ระบุวันของบางแถวไม่ได้ กรุณาตรวจสอบกับ PDF ต้นฉบับ" });
        }
        if (!detectedRoom.value && extracted.rows.length) {
          pageWarnings.push({ page: pageNumber, message: "อ่านหมายเลขห้องไม่ได้ ต้องเลือกห้องให้แต่ละรายการก่อนนำเข้า" });
        }
        rows.push(...extracted.rows);
        for (const course of extracted.courseCatalog) {
          if (!courseCatalog.has(course.courseCode)) courseCatalog.set(course.courseCode, course);
        }
        pages.push({
          page: pageNumber,
          width: canvas.width,
          height: canvas.height,
          textSource: roomSource ?? "PDF_TEXT",
          gridDetected: true,
          grid: {
            x: grid.xBoundaries.map((position) => position / grid.width),
            y: grid.yBoundaries.map((position) => position / grid.height),
          },
          periods: periods.map((period, index) => ({
            period: index + 1,
            startTime: period?.startTime ?? null,
            endTime: period?.endTime ?? null,
          })),
          cells: extracted.cells,
          rawWords: extractionWords.map((word) => normalizeWord(word, canvas.width, canvas.height)),
        });
        successfulPages += 1;
        page.cleanup();
      } catch (error) {
        pagesFailed.push(pageNumber);
        pageWarnings.push({
          page: pageNumber,
          message: error instanceof Error ? error.message : "อ่านหน้านี้ไม่สำเร็จ",
        });
      }
    }
  } finally {
    if (worker) await worker.terminate();
    if (tessdataDirectory) await rm(tessdataDirectory, { recursive: true, force: true });
    await loadingTask.destroy();
  }

  return {
    fileName: path.basename(fileName).slice(0, 200),
    fileHash,
    pageCount,
    successfulPages,
    failedPages: pagesFailed,
    pageWarnings,
    confidenceThresholds,
    roomCodes: [...new Set(rows.flatMap((row) => row.roomCode ? [row.roomCode] : []))],
    courseCatalog: [...courseCatalog.values()],
    pages,
    rows,
  };
}
