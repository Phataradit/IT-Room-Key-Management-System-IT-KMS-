"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { BrowserMultiFormatReader } from "@zxing/browser";
import type { IScannerControls } from "@zxing/browser";

function readRoomToken(value: string) {
  try {
    const url = new URL(value, window.location.origin);
    const segments = url.pathname.split("/").filter(Boolean);
    if (segments.length >= 2 && segments.at(-2) === "scan") return segments.at(-1) ?? null;
  } catch {
    return null;
  }

  return /^[A-Za-z0-9_-]{24,}$/.test(value) ? value : null;
}

export function QrScanner() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState("");
  const [isStarting, setIsStarting] = useState(true);
  const [cameraUnavailable, setCameraUnavailable] = useState(false);

  useEffect(() => {
    let active = true;
    let controls: IScannerControls | undefined;
    if (!window.isSecureContext || typeof navigator.mediaDevices?.getUserMedia !== "function") {
      void Promise.resolve().then(() => {
        if (!active) return;
        setIsStarting(false);
        setCameraUnavailable(true);
        setError("เบราว์เซอร์ปิดการใช้กล้องสำหรับที่อยู่ HTTP นี้ กรุณาถ่ายภาพ QR หรือเปิดระบบผ่าน HTTPS");
      });
      return;
    }

    const reader = new BrowserMultiFormatReader();

    reader.decodeFromVideoDevice(undefined, videoRef.current ?? undefined, (result, _decodeError, scannerControls) => {
      controls = scannerControls;
      if (!active || !result) return;

      const token = readRoomToken(result.getText());
      if (!token) {
        setError("QR Code นี้ไม่ใช่รหัสห้อง IT-KMS กรุณาลองอีกครั้ง");
        return;
      }

      active = false;
      scannerControls.stop();
      router.push(`/scan/${encodeURIComponent(token)}`);
    }).then((scannerControls) => {
      controls = scannerControls;
      if (active) setIsStarting(false);
      else scannerControls.stop();
    }).catch((cause: unknown) => {
      if (!active) return;
      setIsStarting(false);
      setCameraUnavailable(true);
      setError(cause instanceof Error ? `เปิดกล้องไม่สำเร็จ: ${cause.message}` : "เปิดกล้องไม่สำเร็จ กรุณาตรวจสอบสิทธิ์การใช้งานกล้อง");
    });

    return () => {
      active = false;
      controls?.stop();
    };
  }, [router]);

  async function handleImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const imageUrl = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = imageUrl;
      await image.decode();
      const result = await new BrowserMultiFormatReader().decodeFromImageElement(image);
      const token = readRoomToken(result.getText());
      if (!token) {
        setError("QR Code นี้ไม่ใช่รหัสห้อง IT-KMS กรุณาลองอีกครั้ง");
        return;
      }

      router.push(`/scan/${encodeURIComponent(token)}`);
    } catch {
      setError("อ่าน QR Code จากภาพไม่สำเร็จ กรุณาถ่ายภาพให้เห็น QR ชัดเจนแล้วลองอีกครั้ง");
    } finally {
      URL.revokeObjectURL(imageUrl);
    }
  }

  return (
    <section className="scanner-card">
      {!cameraUnavailable && (
        <>
          <div className="scanner-frame">
            <video ref={videoRef} className="scanner-video" muted playsInline aria-label="ภาพจากกล้องสำหรับสแกน QR" />
            <div className="scanner-target" aria-hidden="true"><span /></div>
            {isStarting && <div className="scanner-overlay">กำลังเปิดกล้อง...</div>}
          </div>
          <p className="scanner-instruction">วาง QR Code ให้อยู่ในกรอบเพื่อสแกนอัตโนมัติ</p>
        </>
      )}
      {error && <p className="scanner-error" role="alert">{error}</p>}
      {cameraUnavailable && (
        <label className="scanner-capture-button">
          ถ่ายภาพหรือเลือกรูป QR Code
          <input type="file" accept="image/*" capture="environment" onChange={handleImageChange} />
        </label>
      )}
      <p className="scanner-privacy">กล้องทำงานบนอุปกรณ์ของคุณ ภาพไม่ได้ถูกบันทึกหรือส่งไปที่อื่น</p>
    </section>
  );
}
