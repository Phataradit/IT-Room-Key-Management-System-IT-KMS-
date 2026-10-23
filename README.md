# IT-KMS

ระบบบริหารจัดการห้องและการยืม-คืนกุญแจ วิทยาลัยพณิชยการธนบุรี

## เทคโนโลยี

- Next.js App Router, React, TypeScript
- PostgreSQL และ Prisma ORM
- NextAuth credentials login
- Ant Design icons, Tailwind CSS, ZXing QR scanner
- Zod validation

## เริ่มต้นใช้งาน

ต้องติดตั้ง Node.js LTS และ PostgreSQL ก่อน

1. ติดตั้ง dependencies: `npm install`
2. คัดลอก `.env.example` เป็น `.env` และกำหนด `DATABASE_URL` กับ `NEXTAUTH_SECRET`
3. สร้าง Prisma Client: `npm run db:generate`
4. สร้างและใช้ migration: `npm run db:migrate -- --name init`
5. เพิ่มข้อมูลตัวอย่าง: `npm run db:seed`
6. เริ่ม development server: `npm run dev`

เปิด `http://localhost:3000` แล้วเข้าสู่ระบบด้วยบัญชี seed:

| Role | Username | Password |
| --- | --- | --- |
| Admin | `admin` | `Admin123!` |
| คุณครู | `teacher` | `Teacher123!` |
| นักเรียน/นักศึกษา | `student` | `Student123!` |
| นักเรียน/นักศึกษา (บัญชีทดสอบเพิ่มเติม) | `schoolstudent` | `SchoolStudent123!` |

รหัสผ่านข้างต้นสำหรับพัฒนาท้องถิ่นเท่านั้น ห้ามใช้กับระบบจริง

## ทดลองใช้งานบนมือถือ

1. เชื่อมต่อคอมพิวเตอร์และโทรศัพท์เข้ากับเครือข่าย Wi-Fi เดียวกัน
2. หา IPv4 ของคอมพิวเตอร์ด้วยคำสั่ง `ipconfig` แล้วใช้หมายเลข IPv4 ของเครือข่ายที่เชื่อมต่ออยู่
3. สร้าง production build ด้วย `npm run build`
4. เริ่มเซิร์ฟเวอร์สำหรับเครือข่ายท้องถิ่นด้วย `npm run start:lan`
5. เปิด `http://<IPv4-ของคอมพิวเตอร์>:3000` บนโทรศัพท์ เช่น `http://192.168.1.10:3000`

คอมพิวเตอร์ต้องเปิดเซิร์ฟเวอร์และ PostgreSQL ค้างไว้ตลอดการทดสอบ ใช้ production server แทน `npm run dev` สำหรับมือถือเพื่อหลีกเลี่ยงข้อจำกัด WebSocket ของ Next.js development server การสแกนกล้องแบบเรียลไทม์ต้องใช้ HTTPS; หากเปิดผ่าน HTTP บนเครือข่ายท้องถิ่น ให้ใช้ปุ่มถ่ายภาพหรือเลือกรูป QR แทน

## ขอบเขตที่มีใน starter

- หน้าเข้าสู่ระบบ responsive และตรวจสอบ credentials จากฐานข้อมูล
- Session แบบ JWT พร้อมข้อมูล role จาก server
- Guard สำหรับผู้ใช้ที่เข้าสู่ระบบและ guard ตาม role
- Dashboard, รายการห้อง, รายละเอียดห้อง, ประวัติส่วนตัว และ responsive navigation
- สแกน QR ผ่านกล้องพร้อมตรวจสอบ room token และสถานะ QR ฝั่ง server
- จองห้อง: คำขอ, อนุมัติ/ปฏิเสธ, เริ่มใช้งาน, ยืนยันคืน, ประวัติ และ notification/audit log
- ตรวจช่วงเวลาซ้ำใน transaction โดย lock แถวห้อง และตรวจตารางประจำห้องตามเวลา Asia/Bangkok
- `/borrowings` มีค้นหา, ตัวกรอง, pagination, sort และรายละเอียด/จัดการตาม role ฝั่ง server
- Prisma models สำหรับ users, rooms, keys, schedules, borrow transactions, notifications, settings และ audit logs
- Seed สร้างผู้ใช้ทดลอง ห้องตามหมายเลขที่กำหนดพร้อม token แบบสุ่ม 13 ห้อง และประวัติยืมตัวอย่าง 30 รายการ

ข้อมูลห้องบน dashboard เดิมยังเป็นตัวอย่างสำหรับ UI ส่วนการจองห้องและรายการใน `/borrowings` อ่าน/เขียน PostgreSQL จริง

ข้อมูลตารางเรียนต้องเพิ่มหรือนำเข้าจากข้อมูลที่ตรวจสอบแล้วผ่าน `/room-timetable`; seed จะไม่สร้างตารางเรียนสมมติให้อีก และจะไม่ลบตารางเดิมในฐานข้อมูล

สถานะการจอง: `PENDING → APPROVED → USING → RETURNED`; คำขอที่ยังไม่อนุมัติยกเลิกหรือปฏิเสธได้ การเริ่มใช้งานทำได้ในช่วงเวลาที่จอง และครู/Admin เป็นผู้ยืนยันคืน

Migration `20261008162500_room_bookings` เพิ่ม `BookingStatus` และ `RoomBooking` โดยไม่เปลี่ยนตารางยืมกุญแจเดิม

### Booking API

- `GET /api/borrowings` — search, filter (`roomId`, `status`, `dateFrom`, `dateTo`), sort, pagination; Student เห็นเฉพาะรายการของตัวเอง
- `POST /api/borrowings` — สร้างคำขอสถานะ `PENDING`
- `GET /api/borrowings/[id]` — ดูรายละเอียดตามสิทธิ์
- `PUT /api/borrowings/[id]` — แก้ไขคำขอ `PENDING` ของเจ้าของหรือ Admin
- `DELETE /api/borrowings/[id]` — ยกเลิกคำขอที่มีสิทธิ์ โดยเก็บรายการไว้ในประวัติ
- `POST /api/borrowings/[id]/approve` — Teacher/Admin อนุมัติ
- `POST /api/borrowings/[id]/reject` — Teacher/Admin ปฏิเสธ (ส่ง `{ "reason": "..." }` ได้)
- `POST /api/borrowings/[id]/start` — เจ้าของรายการที่อนุมัติแล้ว หรือ Teacher/Admin เริ่มใช้งานในช่วงเวลาจอง
- `POST /api/borrowings/[id]/return` — Teacher/Admin ยืนยันคืน (ส่ง `{ "returnNote": "..." }` ได้)

การตรวจช่วงเวลาซ้ำรวมรายการ `PENDING`, `APPROVED`, `USING` และตารางห้องประจำสัปดาห์ ระบบ lock แถวห้องใน PostgreSQL transaction ก่อนตรวจและสร้าง/แก้ไขรายการ เพื่อ serialize คำขอพร้อมกันของห้องเดียวกัน

กล้องต้องใช้งานผ่าน `localhost` หรือ HTTPS และผู้ใช้ต้องอนุญาตการเข้าถึงกล้อง

## ตารางประจำห้องและการแจ้งเตือน

- `/room-timetable` แสดงตารางประจำและรายการจองรายสัปดาห์ พร้อมตัวกรอง เพิ่ม/แก้ไข/ลบตาราง และยกเว้นวันที่มีการเปลี่ยนแปลง
- มุมมองรายสัปดาห์ใช้เวลาเริ่ม/สิ้นสุดจริงจากรายการ: ช่วง 07:30–08:00 แยกจากคาบที่ 1, คาบที่ 1–13 แสดงช่วง 08:00–21:00 และรายการหลายชั่วโมงกินความกว้างตามระยะเวลาจริง; รายการเวลาเหลื่อมกันจะแสดงคนละเลน และสามารถเลื่อนแนวนอนเพื่อดูช่วงท้ายได้
- ผู้ใช้ที่เข้าสู่ระบบดูตารางได้; Teacher และ Admin จัดการตาราง/วันยกเว้นได้ โดยตรวจ role และข้อมูลซ้ำที่ Server
- `/notifications` แสดงการแจ้งเตือนของผู้ใช้ที่เข้าสู่ระบบ ส่วนผู้ใช้เห็นข้อมูลส่วนตัวของรายการจองคนอื่นเท่าที่จำเป็น
- `GET /api/room-timetable` อ่านตารางประจำ/รายการจองตามสัปดาห์; `POST` เพิ่มตาราง (Teacher/Admin)
- `/api/room-timetable/[id]` รองรับ `GET`, `PUT`, `DELETE` สำหรับดู/แก้ไข/ลบตาราง; Teacher/Admin เท่านั้นที่แก้ไขได้ การลบเก็บ audit log และลบวันยกเว้นที่ผูกกับตาราง
- `/api/room-timetable/[id]/exceptions` รองรับ `POST` เพื่อยกเว้นวัน และ `DELETE?exceptionId=...` เพื่อนำวันยกเว้นออก
- `/api/notifications` แสดงรายการแจ้งเตือนของผู้ใช้ปัจจุบัน; การอ่าน/อ่านทั้งหมดและการตั้งค่าทำผ่าน endpoints ใต้ `/api/notifications`
- `POST /api/cron/room-usage-notifications` สร้าง in-app notification เมื่อใกล้หมดเวลา, ถึงเวลาสิ้นสุด และเมื่อเกินเวลาตาม threshold ที่ตั้งไว้ โดยใช้ `dedupeKey` ป้องกันรายการซ้ำ
- ปุ่ม **เพิ่มตารางประจำห้อง** อ่าน PDF หลายหน้าด้วย PDF.js และ OCR ไทย/อังกฤษในเครื่อง แสดงผลให้ตรวจและแก้ไขก่อนยืนยันนำเข้าตารางจริง
- PDF ต้นฉบับถูกประมวลผลในหน่วยความจำ ไม่บันทึกไฟล์ลงฐานข้อมูล/public storage หรือส่งไปบริการ OCR ภายนอก; เมื่อยืนยันนำเข้า ระบบเก็บ Raw Extraction แยกจากข้อมูลตารางที่แก้ไขแล้ว รวมคำ OCR/Text Layer พร้อมพิกัด, เส้นกริด, ช่องว่าง/ช่องรวม และรายการวิชาที่ตรวจพบในคลังเอกสารอ้างอิง
- รายการตารางที่นำเข้าจะเก็บไฟล์ต้นฉบับ/หน้า/Cell ต้นทาง, พิกัด Cell, คำ OCR ต้นฉบับ และ structured snapshot ก่อนแก้ไข เพื่อให้ตรวจสอบย้อนกลับได้; ข้อมูลนี้ไม่ใช่ภาพ PDF และไม่ยืนยันว่าผล OCR ถูกต้อง
- รายการที่ไม่พบห้อง วัน หรือเวลา จะไม่สามารถเลือกนำเข้าได้จนกว่าจะแก้ไข; ชื่อวิชา/ผู้สอน/กลุ่มเรียนที่อ่านไม่ชัดจะคงเป็นค่าว่างและผู้ใช้แก้ไขได้
- รหัสห้องที่นำเข้าได้มี 243, 251, 252, 253, 423, 424, 733, 751, 752, 821, 831, 832, 841, 851 และ 862 โดยเลขหลักแรกระบุอาคาร หลักที่สองระบุชั้น และหลักสุดท้ายระบุเลขห้อง
- API นำเข้าตาราง: `POST /api/room-timetable/import/preview` สำหรับตรวจ/อ่าน PDF และ `POST /api/room-timetable/import` สำหรับบันทึกเฉพาะรายการที่ผู้ใช้ยืนยัน; รองรับการข้ามไฟล์/Cell เดิมซ้ำและรายงานผลสำเร็จแยกรายการ
- ปรับข้อจำกัดได้ผ่าน `.env`: `NEXT_PUBLIC_ROOM_SCHEDULE_IMPORT_MAX_BYTES` (ค่าเริ่มต้น 25 MB), `NEXT_PUBLIC_ROOM_SCHEDULE_IMPORT_MAX_PAGES` (ค่าเริ่มต้น 100), `ROOM_SCHEDULE_IMPORT_CONFIDENCE_HIGH` และ `ROOM_SCHEDULE_IMPORT_CONFIDENCE_LOW` (ค่าเริ่มต้น 80/50)
- OCR language data ภาษาอังกฤษและไทยติดตั้งเป็น npm dependencies (`@tesseract.js-data/eng`, `@tesseract.js-data/tha`) เพื่อให้ทำงาน local โดยไม่ดาวน์โหลด traineddata ระหว่างอ่านเอกสาร
- หลังอัปเดต ให้รัน `npm run db:migrate` และ `npm run db:generate`; ครู/Admin เปิด `/room-timetable` → **เพิ่มตารางประจำห้อง** → เลือก PDF → ตรวจ/แก้ข้อมูลและเปิด PDF ต้นฉบับ → เลือกรายการ → ยืนยันนำเข้า

ตั้ง `CRON_SECRET` ใน `.env` ให้เป็น secret แบบสุ่มและไม่เปิดเผย จากนั้นให้ Windows Task Scheduler เรียก `npm.cmd run notifications:run` ทุก 5 นาที โดยกำหนด **Start in** เป็นโฟลเดอร์ `it-kms` และให้เซิร์ฟเวอร์กับ PostgreSQL ทำงานอยู่ตลอด หาก endpoint ไม่ได้อยู่ที่ `http://localhost:3000/api/cron/room-usage-notifications` ให้กำหนด `ROOM_NOTIFICATION_JOB_URL` ใน `.env` ด้วย คำสั่งใช้ Node.js ที่รองรับ `--env-file` (20.6 ขึ้นไป) และจะแสดง error/exit code เมื่องานไม่สำเร็จ

การแจ้งเตือนปัจจุบันจัดเก็บในฐานข้อมูลและแสดงในเว็บ (กระดิ่ง poll เพื่ออัปเดต UI) **ยังไม่มี Web Push, อีเมล หรือ SMS** การแจ้งเตือนการสิ้นสุดตารางเรียนเป็นการเตือนตามเวลาในตาราง ไม่ได้ยืนยันว่าห้องว่างจริงหรือสั่งคืนห้องอัตโนมัติ

## Database constraint

Initial SQL migration มี PostgreSQL partial unique index เพื่อป้องกันการยืมห้องซ้ำ:

```sql
CREATE UNIQUE INDEX "BorrowTransaction_one_active_per_room"
ON "BorrowTransaction" ("roomId")
WHERE "status" IN ('PENDING', 'BORROWED', 'OVERDUE');
```

Prisma schema DSL ใน Prisma 6 ยังไม่รองรับ partial index นี้โดยตรง จึงคง constraint ไว้ใน SQL migration
