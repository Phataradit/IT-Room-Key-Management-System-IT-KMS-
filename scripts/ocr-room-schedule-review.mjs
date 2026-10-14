import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createCanvas } from "@napi-rs/canvas";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { createWorker } from "tesseract.js";

const roomCodes = new Set(["251", "252", "253", "831", "832", "751", "821", "823", "851", "841", "243", "861", "862"]);
const weekDays = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"];

function csvCell(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function mapGridPosition(match, width, height) {
  const period = Math.round((match.x / width - 577 / 2523) / (153 / 2523)) + 1;
  const dayIndex = Math.round((match.y / height - 844 / 1785) / (109 / 1785));
  if (period < 1 || period > 13 || dayIndex < 0 || dayIndex >= weekDays.length) return null;
  const expectedX = (577 + (period - 1) * 153) / 2523 * width;
  const expectedY = (844 + dayIndex * 109) / 1785 * height;
  if (Math.abs(match.x - expectedX) > 55 * width / 2523 || Math.abs(match.y - expectedY) > 42 * height / 1785) return null;
  return {
    dayOfWeek: weekDays[dayIndex],
    period,
    startTime: `${String(period + 7).padStart(2, "0")}:00`,
    endTime: `${String(period + 8).padStart(2, "0")}:00`,
  };
}

function linePositions(canvas) {
  const width = canvas.width;
  const height = canvas.height;
  const pixels = canvas.getContext("2d").getImageData(0, 0, width, height).data;
  const dark = (x, y) => {
    const offset = (y * width + x) * 4;
    return Math.max(pixels[offset], pixels[offset + 1], pixels[offset + 2]) < 165;
  };
  const verticalScores = Array.from({ length: width }, (_, x) => {
    let count = 0;
    for (let y = Math.round(height * 0.36); y < Math.round(height * 0.88); y += 1) {
      if (dark(x, y)) count += 1;
    }
    return count;
  });
  const horizontalScores = Array.from({ length: height }, (_, y) => {
    let count = 0;
    for (let x = Math.round(width * 0.12); x < Math.round(width * 0.99); x += 1) {
      if (dark(x, y)) count += 1;
    }
    return count;
  });
  const peaks = (scores, minimum, radius) => {
    const result = [];
    for (let index = 1; index < scores.length - 1; index += 1) {
      if (scores[index] < minimum || scores[index] < scores[index - 1] || scores[index] < scores[index + 1]) continue;
      const previous = result.at(-1);
      if (previous && index - previous.position <= radius) {
        if (scores[index] > previous.score) Object.assign(previous, { position: index, score: scores[index] });
      } else {
        result.push({ position: index, score: scores[index] });
      }
    }
    return result;
  };
  return {
    vertical: peaks(verticalScores, Math.round(height * 0.18), 6),
    horizontal: peaks(horizontalScores, Math.round(width * 0.4), 5),
  };
}

async function collectPdfs(inputPath) {
  const info = await import("node:fs/promises").then(({ stat }) => stat(inputPath));
  if (info.isFile()) return [inputPath];
  const results = [];
  async function walk(directory) {
    const children = await readdir(directory, { withFileTypes: true });
    for (const child of children.sort((a, b) => a.name.localeCompare(b.name, "en"))) {
      const childPath = path.join(directory, child.name);
      if (child.isDirectory()) await walk(childPath);
      else if (child.isFile() && child.name.toLowerCase().endsWith(".pdf")) results.push(childPath);
    }
  }
  await walk(inputPath);
  return results;
}

async function main() {
  const inputPath = path.resolve(process.argv[2] ?? "");
  if (!process.argv[2]) throw new Error("Usage: node scripts/ocr-room-schedule-review.mjs <pdf-or-directory> [output.csv]");
  const outputPath = process.argv[3] ? path.resolve(process.argv[3]) : null;
  const pdfFiles = await collectPdfs(inputPath);
  if (!pdfFiles.length) throw new Error("No PDF files found");
  const worker = await createWorker("eng", 1, { logger: () => {} });
  await worker.setParameters({
    tessedit_char_whitelist: "0123456789",
    classify_bln_numeric_mode: "1",
  });
  const reviewRows = [];
  const sourceRows = [];

  try {
    for (const [index, pdfPath] of pdfFiles.entries()) {
      const source = `PDF-${String(index + 1).padStart(3, "0")}`;
      sourceRows.push({ source, file: path.basename(pdfPath) });
      const document = await getDocument({ data: new Uint8Array(await readFile(pdfPath)) }).promise;
      for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
        const page = await document.getPage(pageNumber);
        const viewport = page.getViewport({ scale: 3 });
        const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
        await page.render({ canvas, canvasContext: canvas.getContext("2d"), viewport }).promise;
        if (index < 2) console.log("Grid line candidates", JSON.stringify(linePositions(canvas)));
        const { data } = await worker.recognize(canvas.toBuffer("image/png"), {}, { blocks: true });
        const words = data.blocks?.flatMap((block) =>
          block.paragraphs.flatMap((paragraph) =>
            paragraph.lines.flatMap((line) => line.words),
          ),
        ) ?? [];
        const headerNumberPositions = words.filter((word) =>
          /^\d{1,2}$/.test(word.text)
          && word.bbox.y0 > 600
          && word.bbox.y1 < 780,
        ).map((word) => ({
          length: word.text.length,
          confidence: Math.round(word.confidence),
          x: Math.round((word.bbox.x0 + word.bbox.x1) / 2),
          y: Math.round((word.bbox.y0 + word.bbox.y1) / 2),
        }));
        if (headerNumberPositions.length) console.log("Header number positions", JSON.stringify(headerNumberPositions));
        const matches = words
          .map((word) => ({
            code: word.text.replace(/\D/g, ""),
            confidence: Math.round(word.confidence),
            x: Math.round((word.bbox.x0 + word.bbox.x1) / 2),
            y: Math.round((word.bbox.y0 + word.bbox.y1) / 2),
          }))
          .filter((word) => roomCodes.has(word.code));
        const mappedBefore = reviewRows.length;
        const unmapped = [];
        for (const match of matches) {
          const grid = mapGridPosition(match, viewport.width, viewport.height);
          if (!grid) {
            unmapped.push({ code: match.code, x: match.x, y: match.y });
            continue;
          }
          reviewRows.push({
            source,
            page: pageNumber,
            ...grid,
            roomCode: match.code,
            confidence: match.confidence,
            review: "REVIEW_REQUIRED",
            x: match.x,
            y: match.y,
          });
        }
        const mappedCount = reviewRows.length - mappedBefore;
        console.log(`${source} page ${pageNumber}: ${matches.length} candidates, ${mappedCount} mapped`);
        if (unmapped.length) console.log("Off-grid room-code candidates", JSON.stringify(unmapped));
        page.cleanup();
      }
      await document.cleanup();
    }
  } finally {
    await worker.terminate();
  }

  if (outputPath) {
    const columns = ["source", "page", "dayOfWeek", "period", "startTime", "endTime", "roomCode", "confidence", "review", "x", "y"];
    const csv = [
      columns.join(","),
      ...reviewRows.map((row) => columns.map((column) => csvCell(row[column])).join(",")),
    ].join("\r\n");
    await writeFile(outputPath, `${csv}\r\n`, "utf8");
    await writeFile(`${outputPath}.sources.csv`, [
      "source,file",
      ...sourceRows.map((row) => `${csvCell(row.source)},${csvCell(row.file)}`),
    ].join("\r\n") + "\r\n", "utf8");
    console.log(`Wrote ${reviewRows.length} room-code candidates from ${sourceRows.length} PDFs`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
