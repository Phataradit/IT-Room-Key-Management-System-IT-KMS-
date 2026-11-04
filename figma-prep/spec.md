# Figma preparation spec — source: `it-kms`

> Scope note: the selected repository is IT-KMS (room/key management), not a To-Do app. The repository has room bookings and key-borrow transactions, but no Task entity or task-list feature. They are documented below as existing features and are not represented as tasks. “NOT FOUND” means the requested concept was not found in the inspected source.
>
> Sources below use paths relative to the repository root. Line numbers refer to the current source files.

## A. Data model

### Task-domain check

| Entity / property | Result | Source |
|---|---|---|
| Task / To-Do | NOT FOUND: no `Task` Prisma model, task type, task route, or task UI was found. | `prisma/schema.prisma` contains the models listed below; task search returned no matches. |
| Category / Tag | NOT FOUND as task categorization. | No task model or task-category relation in `prisma/schema.prisma`. |
| User | Found, but it is the IT-KMS account/person model, not a task owner profile for a To-Do app. | `prisma/schema.prisma:103-137`; login uses username/email and password (`app/login/login-form.tsx:59-76`). |
| Room booking | Found; this is the nearest workflow analogue, not a Task. | `prisma/schema.prisma:319-350`; input validation is in `lib/borrowings/schemas.ts:6-45`. |

### Existing booking model (nearest workflow analogue)

Prisma non-null fields are marked **yes** under Required; nullable fields are **no**. Prisma schema defaults are reported as written. Business validation is separate from Prisma field nullability.

| Field | Type | Required? | Default | Allowed values / validation |
|---|---|---:|---|---|
| `id` | String | yes | `cuid()` | Primary key. |
| `bookingNo` | String | yes | NOT FOUND in schema (generated in service) | Unique; generated as `RM-<Bangkok date>-<random uppercase hex>` by service. |
| `userId` | String | yes | none | Relation to booking owner. |
| `roomId` | String | yes | none | Relation to Room; input schema requires 1–30 chars. |
| `startsAt` | DateTime | yes | none | ISO datetime with offset; must be in the future. |
| `endsAt` | DateTime | yes | none | ISO datetime with offset; must be after `startsAt`. |
| `status` | `BookingStatus` enum | yes | `PENDING` | `PENDING`, `APPROVED`, `USING`, `RETURNED`, `CANCELLED`, `REJECTED`. |
| `purpose` | String | yes | none | Trimmed; 3–500 chars. |
| `attendeeCount` | Int | yes | none | Integer 1–1000; additionally cannot exceed the selected room's capacity. |
| `note` | String? | no | none | Optional / nullable; trimmed, max 2000 chars. |
| `approvedById` | String? | no | none | Optional approver user relation. |
| `approvedAt` | DateTime? | no | none | Set when approved. |
| `rejectedById` | String? | no | none | Optional rejecting user relation. |
| `rejectedAt` | DateTime? | no | none | Set when rejected. |
| `rejectionReason` | String? | no | none | Optional reason; rejection input max 1000 chars. |
| `startedAt` | DateTime? | no | none | Set when booking moves to `USING`; start is allowed only within booked time. |
| `returnedAt` | DateTime? | no | none | Set on confirmed return. |
| `returnNote` | String? | no | none | Optional return note; input max 2000 chars. |
| `returnedById` | String? | no | none | Optional return confirmer relation. |
| `createdAt` | DateTime | yes | `now()` | Creation timestamp. |
| `updatedAt` | DateTime | yes | `@updatedAt` | Updated automatically by Prisma. |

**Sources:** field definitions and enum at `prisma/schema.prisma:76-83,319-350`; input constraints and date ordering at `lib/borrowings/schemas.ts:6-27`; status change, capacity and booking-window rules at `lib/borrowings/service.ts:77-155,284-405`.

### Related existing entities

| Entity | Fields (type; required?; default) | Allowed values / validation | Source |
|---|---|---|---|
| `User` | `id` String / yes / `cuid()`; `username` String / yes / none; `email` String / yes / none; `passwordHash` String / yes / none; `prefix` String? / no; `firstName` String / yes; `lastName` String / yes; `studentId` String? / no; `employeeId` String? / no; `phone` String? / no; `role` enum / yes / `STUDENT`; `department` String? / no; `classRoom` String? / no; `avatarUrl` String? / no; `status` enum / yes / `ACTIVE`; `lastLoginAt` DateTime? / no; `createdAt` DateTime / yes / `now()`; `updatedAt` DateTime / yes / `@updatedAt`; `deletedAt` DateTime? / no. | Username/email unique; student and employee identifiers unique when present. Role: `STUDENT`, `TEACHER`, `ADMIN`. Status: `ACTIVE`, `INACTIVE`, `SUSPENDED`. Authentication uses credentials; no sign-up flow found. | `prisma/schema.prisma:11-21,103-137`; `app/login/login-form.tsx:14-38`. |
| `Room` | `id` String / yes / `cuid()`; `roomCode` String / yes; `roomName` String / yes; `building` String / yes; `floor` String / yes; `roomType` enum / yes; `description` String? / no; `capacity` Int? / no; `status` enum / yes / `AVAILABLE`; `qrToken` String? / no; `qrVersion` Int / yes / `1`; `qrGeneratedAt` DateTime? / no; `qrRevokedAt` DateTime? / no; `createdAt` DateTime / yes / `now()`; `updatedAt` DateTime / yes / `@updatedAt`; `deletedAt` DateTime? / no. | `roomCode` and present `qrToken` unique. Types: `COMPUTER_LAB`, `CLASSROOM`, `SERVER_ROOM`, `STORAGE_ROOM`, `OFFICE`, `OTHER`. Status: `AVAILABLE`, `BORROWED`, `MAINTENANCE`, `DISABLED`. | `prisma/schema.prisma:23-37,139-164`. |
| `BorrowTransaction` (legacy key borrowing, distinct from RoomBooking) | `id` String / yes / `cuid()`; `transactionNo` String / yes; `userId` String / yes; `roomId` String / yes; `borrowedAt` DateTime / yes / `now()`; `expectedReturnAt` DateTime / yes; `returnedAt` DateTime? / no; `status` enum / yes / `BORROWED`; `purpose` String / yes; `note` String? / no; `approvedById` String? / no; `approvedAt` DateTime? / no; `returnNote` String? / no; `createdAt` DateTime / yes / `now()`; `updatedAt` DateTime / yes / `@updatedAt`. | `transactionNo` unique. Status: `PENDING`, `BORROWED`, `RETURNED`, `OVERDUE`, `CANCELLED`. | `prisma/schema.prisma:68-74,276-301`. |
| `BorrowItem` | `id` String / yes / `cuid()`; `transactionId` String / yes; `keyId` String / yes; `quantity` Int / yes / `1`; `conditionBefore` enum / yes; `conditionAfter` enum? / no; `createdAt` DateTime / yes / `now()`; `updatedAt` DateTime / yes / `@updatedAt`. | Unique per `(transactionId, keyId)`. Key condition: `GOOD`, `FAIR`, `DAMAGED`. | `prisma/schema.prisma:47-51,303-317`. |

**Additional schema inventory:** `RoomTeacher`, `RoomKey`, `RoomSchedule`, `Course`, `RoomScheduleImport`, `RoomScheduleException`, `Notification`, `SystemSetting`, and `AuditLog` also exist; they are room/schedule/system entities, not To-Do categories or tags. Full model definitions are in `prisma/schema.prisma:166-238,250-274,352-392`. No OpenAPI/Swagger spec or locale/message catalog was found; UI copy is hard-coded in pages/components. Tailwind is imported in CSS (`app/globals.css:1`); no separate Tailwind config was found in the project file inventory.

## B. Existing screens and routes

The page routes below are the app pages (not every API endpoint). Shared authenticated layout and navigation are in `components/layout/dashboard-shell.tsx:1-80`.

| Route | Purpose / main components | User actions | Source |
|---|---|---|---|
| `/` | Redirects to login. | Automatic redirect. | `app/page.tsx:1-5`. |
| `/login` | Credentials login screen, `LoginForm`. Existing-session users are redirected by role. | Submit username/email + password; no registration link or sign-up flow found. | `app/login/page.tsx:1-18`; `app/login/login-form.tsx:14-90`. |
| `/dashboard` | User home dashboard: quick links, current-borrowing empty/summary card, recent room status; uses `DashboardView` and `DashboardShell`. | Go to QR scan, room search/detail, history, dashboard navigation. The visible room preview is hard-coded UI sample data in `DashboardView`. | `app/dashboard/page.tsx:1-10`; `components/dashboard/dashboard-view.tsx:1-88`. |
| `/admin/dashboard` | Admin-guarded dashboard using the same `DashboardView`. | Same dashboard actions; admin role label. | `app/admin/dashboard/page.tsx:1-10`. |
| `/rooms` | Room availability list. | Open a room row/detail; no search/filter controls found on this page. | `app/rooms/page.tsx:1-56`. |
| `/rooms/[roomCode]` | Room detail: room attributes, live borrowing/booking state, weekly schedule. | Return to room list; request room use if serviceable and unoccupied. | `app/rooms/[roomCode]/page.tsx:11-123`. |
| `/scan` | QR camera/image scanner (`QrScanner`). | Scan live camera QR or select/capture image; valid token navigates to result. | `app/scan/page.tsx:1-22`; `components/qr/qr-scanner.tsx:1-94`. |
| `/scan/[token]` | Validates token and shows scanned room summary. | Open room details or request room use when available. | `app/scan/[token]/page.tsx:10-62`. |
| `/borrowings` | Room booking table (`BorrowingsTable`), with per-role visibility/actions. | Search, room/status/date filter, sort, pagination, view detail modal, create/edit, approve/reject, start, return, cancel as allowed. | `app/borrowings/page.tsx:1-37`; `components/borrowings/borrowings-table.tsx:111-433`. |
| `/borrowings/new` | Room booking creation form (`BookingForm`). | Select room/date/time, enter purpose/attendee count/optional note; cancel or submit. | `app/borrowings/new/page.tsx:1-46`; `components/borrowings/booking-form.tsx:90-195`. |
| `/borrowings/[id]/edit` | Existing pending room booking edit form; unavailable/unauthorized cases redirect to list. | Edit allowed only for a pending booking by its owner or Admin; Teacher is redirected. | `app/borrowings/[id]/edit/page.tsx:10-61`; form in `components/borrowings/booking-form.tsx`. |
| `/history` | Current user's latest 50 legacy key-borrow transactions. | Read-only history list. | `app/history/page.tsx:1-42`. |
| `/room-timetable` | Weekly room schedule/booking calendar; uses `RoomTimetableView`. | Week/list view, room/day/type/status/teacher filters and search; teacher/Admin can manage schedules, exceptions, and PDF imports. | `app/room-timetable/page.tsx:1-16`; `components/room-timetable/room-timetable-view.tsx:1-773`; `components/room-timetable/room-schedule-import.tsx`. |
| `/notifications` | Notification center; Admin additionally gets reminder settings. | Search/filter by read/type, mark one/all read, follow action link; Admin adjusts usage reminder settings. | `app/notifications/page.tsx:1-17`; `components/notifications/notification-center.tsx:1-309`. |
| `/courses` | Course search component in shared shell. Sidebar link is hidden by CSS in current layout. | Course-search actions are in `components/courses/course-search.tsx`; route itself renders that component. | `app/courses/page.tsx:1-15`; `app/globals.css:329-330`. |

**Relevant API surfaces:** booking list/create `app/api/borrowings/route.ts`; booking get/update/delete `app/api/borrowings/[id]/route.ts`; status endpoints under `app/api/borrowings/[id]/{approve,reject,start,return}/route.ts`. Notification endpoints are under `app/api/notifications/`; timetable endpoints are under `app/api/room-timetable/`. These are APIs, not additional user-facing pages.

## C. Mapping to the required mobile screens

All task-related screen data/actions below are marked NEW or NOT FOUND where the web app has no To-Do feature. Existing room-booking components may inform layout only; booking fields must not be relabeled as task fields without product confirmation.

| Requested mobile screen | Purpose | Fields to show | Buttons / actions | Navigation | Existing web source |
|---|---|---|---|---|---|
| 1. Splash Screen | NOT FOUND. No splash route, startup screen, or splash copy found. | NOT FOUND. | NOT FOUND. | NOT FOUND. | **NEW, not in web app.** |
| 2. Login / Sign Up | Login exists; sign-up is NOT FOUND. | Username or email; password. | “เข้าสู่ระบบ”; no sign-up action. Required HTML inputs. | Successful Admin → `/admin/dashboard`; other roles → `/dashboard`; login error stays on form. | Login source: `/login` and `LoginForm`; sign-up **NEW, not in web app**. |
| 3. Task list | **NEW, not in web app.** No task list, task search, task filters, or task completion state found. | NOT FOUND. Nearest unrelated analogue is room bookings: booking no., date/time, room, borrower, purpose, status, confirmation. | NOT FOUND for tasks. Existing booking list supports search, room/status/date filters, sorting, pagination, and role-gated booking actions. | New task navigation NOT FOUND. Booking analogue is `/borrowings` → create/edit/detail/status actions. | Booking table is an analogue only; `app/borrowings/page.tsx`; `components/borrowings/borrowings-table.tsx`. |
| 4. Task Detail | **NEW, not in web app.** There is no task detail route. Booking detail appears in an in-page modal, not a dedicated page. | Task fields NOT FOUND. Booking modal shows status, room, owner, attendee count, start/end, purpose, note, approver/rejecter/returner details where present. | Booking modal has “ปิด”; no task actions found. | Booking modal closes back to `/borrowings`. | `components/borrowings/borrowings-table.tsx:372-393`. |
| 5. Completed | **NEW, not in web app.** No completed-task page/filter found. | NOT FOUND. Existing booking status `RETURNED` means a room has been returned, not a completed task. | No task completion controls. Room-return confirmation exists for Teacher/Admin on `USING` booking. | Booking stays in `/borrowings`; key transaction history is `/history`. | `components/borrowings/borrowings-table.tsx:307-309`; `app/history/page.tsx`. |
| 6. Add Task | **NEW, not in web app.** Closest unrelated screen is “สร้างรายการยืมห้อง”. | Task title/due date/category/priority NOT FOUND. Booking form instead has room, date, start/end time, purpose, attendee count, optional note. | No task submit action. Booking analogue buttons: “ยกเลิก”, “ส่งคำขอยืมห้อง”; edit submit is “บันทึกการแก้ไข”. | Existing form success routes to `/borrowings`; cancellation goes back. | `app/borrowings/new/page.tsx`; `components/borrowings/booking-form.tsx:90-195`. |
| 7. Profile / Settings | **NEW, not in web app** as a user profile/settings page. Header only shows current name/role/avatar initial and sign-out. Admin notification settings are not profile settings. | User model has name, username/email, student/employee ID, phone, role, department, classroom, avatar URL, and account status; a profile UI to display/edit them was NOT FOUND. | Sign out in shared header. Notification settings only for Admin on `/notifications`. | Sign out returns through auth flow; profile route NOT FOUND. | `prisma/schema.prisma:103-137`; `components/layout/dashboard-shell.tsx:50-58`; `components/layout/sign-out-button.tsx`. |

## D. UI copy

This section captures literal copy from the relevant current screens/components. Task-only copy is NOT FOUND. Dynamic values such as names and IDs are shown as placeholders in the description, not invented strings.

### Login / Sign Up

- Labels: “ชื่อผู้ใช้หรืออีเมล”; “รหัสผ่าน”.
- Placeholders: “กรอกชื่อผู้ใช้หรืออีเมล”; “กรอกรหัสผ่าน”.
- Heading/help: “ยินดีต้อนรับ”; “เข้าสู่ระบบ”; “กรอกบัญชีผู้ใช้เพื่อดำเนินการต่อ”; “ระบบสำหรับนักเรียน/นักศึกษาและบุคลากร วิทยาลัยพณิชยการธนบุรี”.
- Button/loading: “เข้าสู่ระบบ”; “กำลังเข้าสู่ระบบ...”.
- Error: “ระบบไม่สามารถเชื่อมต่อฐานข้อมูลได้ กรุณาลองใหม่อีกครั้ง”; “ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง หรือบัญชีถูกระงับ”.
- Sign-up label, placeholder, validation, and error copy: **NOT FOUND**.
- Source: `app/login/login-form.tsx:23-90`.

### Dashboard (nearest existing home, not a task list)

- Heading/subtitle: “สวัสดี, [ชื่อ]”; “จัดการการยืม-คืนกุญแจห้องของคุณได้ที่นี่”.
- Quick actions: “สแกน QR Code”; “สแกนเพื่อดูข้อมูลห้อง”; “ค้นหาห้อง”; “ดูสถานะและรายละเอียด”.
- Sections/actions: “สถานะการยืมของคุณ”; “รายการที่กำลังดำเนินการ”; “ประวัติทั้งหมด”; “ยังไม่มีรายการยืม”; “ยังไม่มีรายการยืมที่กำลังดำเนินการ”; “สแกน QR Code หรือค้นหาห้องเพื่อเริ่มยืมกุญแจ”; “ดูห้องทั้งหมด”; “สถานะห้องล่าสุด”; “ตรวจสอบห้องและความพร้อมใช้งาน”; “หากต้องการความช่วยเหลือ กรุณาติดต่อผู้ดูแลระบบ”.
- Source: `components/dashboard/dashboard-view.tsx:23-83`.

### Task list / Task Detail / Completed

- Task labels, search placeholders, filters, empty states, task detail labels, and completion copy: **NOT FOUND**.
- Existing booking list (distinct feature) labels include: “รายการยืม-คืนห้อง”; “ตรวจสอบ อนุมัติ และจัดการรายการใช้ห้อง”; “ค้นหารายการ”; “ค้นหารหัส รายชื่อ วัตถุประสงค์ หรือห้อง”; “ทุกห้อง”; “ทุกสถานะ”; “ตั้งแต่”; “ถึง”; “สร้างรายการ”; “ยังไม่มีรายการยืม-คืน”; columns “รหัสรายการ”, “วันที่”, “ห้อง”, “เวลาเริ่ม”, “เวลาสิ้นสุด”, “ผู้ยืม”, “วัตถุประสงค์”, “สถานะ”, “ลายเซ็น/การยืนยัน”, “การจัดการ”.
- Booking actions/status copy: “ดู”; “แก้ไข”; “อนุมัติ”; “ปฏิเสธ”; “เริ่มใช้”; “ยืนยันคืน”; “ยกเลิก”; “รออนุมัติ”; “อนุมัติแล้ว”; “กำลังใช้งาน”; “คืนแล้ว”; “ปฏิเสธ”.
- Source: `app/borrowings/page.tsx:20-35`; `components/borrowings/borrowings-table.tsx:60-73,266-369`.

### Add Task (booking-form analogue only)

- Task field labels/placeholder/button/error copy: **NOT FOUND**.
- Booking headings/subtitle: “คำขอใช้ห้อง”; “สร้างรายการยืมห้อง”; “เลือกห้องและช่วงเวลา ระบบจะตรวจสอบตารางและรายการจองซ้ำให้”.
- Booking labels: “ห้อง *”; “วันที่ *”; “เวลาเริ่ม *”; “เวลาสิ้นสุด *”; “วัตถุประสงค์ *”; “จำนวนผู้ใช้งาน *”; “หมายเหตุ”.
- Booking placeholders: “เลือกห้อง”; “เช่น สอนวิชา Database Systems”; “รายละเอียดเพิ่มเติม (ถ้ามี)”.
- Booking actions: “ยกเลิก”; “ส่งคำขอยืมห้อง”; edit: “บันทึกการแก้ไข”.
- Booking feedback/errors: “บันทึกรายการไม่สำเร็จ”; “บันทึกรายการแล้ว”; “เชื่อมต่อระบบไม่สำเร็จ กรุณาลองอีกครั้ง”; validation includes “เวลาสิ้นสุดต้องอยู่หลังเวลาเริ่ม”, “วันและเวลาเริ่มต้องอยู่ในอนาคต”, “วันที่สิ้นสุดต้องไม่น้อยกว่าวันที่เริ่ม”.
- Source: `app/borrowings/new/page.tsx:24-31`; `components/borrowings/booking-form.tsx:48-195`; `lib/borrowings/schemas.ts:13-18,39-42`.

### Profile / Settings

- Profile/settings page labels, edit/save buttons, and empty states: **NOT FOUND**.
- Shared shell copy: “ระบบจัดการกุญแจ”; “หน้าหลัก”; “เมนูหลัก”; “ต้องการความช่วยเหลือ?”; “ติดต่อผู้ดูแลระบบของคุณ”; “ติดต่อเรา”; mobile navigation “หน้าหลัก”, “ห้อง”, “ตาราง”, “สแกน”, “จอง”, “ประวัติ”.
- Sign-out button implementation: `components/layout/sign-out-button.tsx`; current display name/role in `components/layout/dashboard-shell.tsx:49-58,68-73`.

### Other existing screen copy (for source fidelity)

- Rooms: “ห้องทั้งหมด”; “ค้นหาและตรวจสอบสถานะห้องในวิทยาลัย”; “ยังไม่มีข้อมูลห้อง”; detail headings “ข้อมูลห้อง”, “สถานะการยืม”, “ตารางประจำห้อง”; actions “ขอใช้ห้อง”; empty states “ห้องนี้ยังไม่มีรายการยืมที่กำลังดำเนินการ”, “ยังไม่มีตารางประจำห้อง”. Source: `app/rooms/page.tsx:29-53`; `app/rooms/[roomCode]/page.tsx:67-120`.
- Scan: “สแกน QR Code”; “สแกน QR Code ของห้อง หรือถ่ายภาพ QR เพื่อเปิดจากมือถือ”; “วาง QR Code ให้อยู่ในกรอบเพื่อสแกนอัตโนมัติ”; “ถ่ายภาพหรือเลือกรูป QR Code”; errors “QR Code นี้ไม่ใช่รหัสห้อง IT-KMS กรุณาลองอีกครั้ง”, “อ่าน QR Code จากภาพไม่สำเร็จ กรุณาถ่ายภาพให้เห็น QR ชัดเจนแล้วลองอีกครั้ง”; privacy copy says the camera runs on-device and the image is not saved/sent elsewhere. Source: `app/scan/page.tsx:13-18`; `components/qr/qr-scanner.tsx:31-82`.
- History: “ประวัติการยืม-คืน”; “แสดงเฉพาะรายการที่คุณเป็นผู้ยืม”; empty “ยังไม่มีประวัติการยืม”. Source: `app/history/page.tsx:20-39`.
- Notifications: “การแจ้งเตือน”; “ทำเครื่องหมายอ่านทั้งหมด”; “ยังไม่อ่าน”; “อ่านแล้ว”; “ทุกประเภท”; “ค้นหาการแจ้งเตือน”; empty “ไม่มีการแจ้งเตือน”; Admin settings labels “แจ้งเตือนก่อนหมดเวลา (นาที)”, “แจ้งเตือนเกินเวลา (นาที คั่นด้วยจุลภาค)”, “ส่งการแจ้งเตือนการใช้ห้องให้ Admin”, “บันทึกการตั้งค่า”. Source: `components/notifications/notification-center.tsx:31-42,188-305`.

## E. User flows

### Auth flow

1. `/` redirects to `/login`.
2. `/login` redirects an existing session to `/admin/dashboard` for Admin and `/dashboard` for other roles.
3. User submits required username/email and password; `LoginForm` calls NextAuth credentials sign-in with client-side redirect disabled.
4. On failure it shows the database-connection or credential/account-suspended error. On success it reads the session and routes Admin to `/admin/dashboard`, others to `/dashboard`, then refreshes.
5. No sign-up, password reset, or profile-creation flow was found.

Source: `app/page.tsx:3-5`; `app/login/page.tsx:9-18`; `app/login/login-form.tsx:14-40,59-85`.

### Create task

- Task creation flow: **NOT FOUND**.
- Nearest distinct room-booking flow: open `/borrowings/new` (optionally prefilled with `roomId` from a room detail), choose an eligible room/date/start/end, enter purpose and attendee count plus optional note; client posts to `/api/borrowings`; server validates fields, capacity, availability, overlapping reservations, and recurring timetable; booking is created `PENDING`; success message appears, then navigation returns to `/borrowings`.

Source: `app/rooms/[roomCode]/page.tsx:101-106`; `app/borrowings/new/page.tsx:9-43`; `components/borrowings/booking-form.tsx:27-83,104-191`; `lib/borrowings/schemas.ts:6-27`; `lib/borrowings/service.ts:77-155,196-230`.

### Edit task

- Task editing flow: **NOT FOUND**.
- Room-booking analogue: owner (Student) or Admin may open edit only while status is `PENDING`; edit page loads values and redirects back for missing, non-pending, Teacher, or unauthorized booking. The form `PUT`s `/api/borrowings/[id]`; service checks room/date availability again and records audit data.

Source: `app/borrowings/[id]/edit/page.tsx:10-60`; `components/borrowings/booking-form.tsx:27-83`; `lib/borrowings/service.ts:233-280`.

### Complete task

- Task completion flow: **NOT FOUND**.
- Room-booking analogue (not task completion): approved booking can be started by its owner or staff during the reserved time, changing status to `USING`; Teacher/Admin confirms return and may enter an optional return note, changing status to `RETURNED`.

Source: `components/borrowings/borrowings-table.tsx:301-309,394-410`; `lib/borrowings/service.ts:284-390`.

### Delete task

- Task deletion flow: **NOT FOUND**.
- Room-booking analogue: owner may cancel own `PENDING` booking; Admin may cancel `PENDING` or `APPROVED`. The DELETE endpoint changes status to `CANCELLED` and writes audit data; it does not physically delete the booking. Confirmation copy is “ยกเลิกคำขอนี้หรือไม่?”.

Source: `components/borrowings/borrowings-table.tsx:309-312`; `lib/borrowings/service.ts:391-405`; endpoint `app/api/borrowings/[id]/route.ts`.

## F. Web-to-mobile gaps

- The desktop sidebar is replaced by an existing 6-item fixed mobile navigation; it is already in the responsive implementation. For a To-Do app, a bottom tab bar could be designed as **new product behavior**, not copied from task features. Source: `components/layout/dashboard-shell.tsx:68-75`; `app/globals.css:1219-1228,1502-1557`.
- The booking list uses a 1450px horizontally scrollable table with many columns and per-row action buttons; use stacked booking cards and a compact overflow/action sheet on mobile. Source: `components/borrowings/borrowings-table.tsx:266-369`.
- Table filter controls (search, room/status selects, date range) wrap in a desktop toolbar; use a search field plus a filter bottom sheet on narrow screens. Source: `components/borrowings/borrowings-table.tsx:319-352`; CSS toolbar `app/globals.css:1045-1098`.
- Booking details are in a wide modal; use a full-height detail sheet/page on mobile. Source: `components/borrowings/borrowings-table.tsx:372-393`.
- Timetable supports a week grid and list; favor the existing list mode or a day-at-a-time selector on small screens rather than squeezing the multi-day grid. Source: `components/room-timetable/room-timetable-view.tsx:160-167` and responsive styles `app/globals.css:1864-1908`.
- The dashboard's two-column quick actions and room detail cards become constrained on phones; keep actions as full-width cards and stack details. Source: `app/globals.css:573-587,886-896,1257-1290`.
- QR scanning already supports camera and image capture/selection, which is suitable for mobile; camera use requires a secure context except browser exceptions for localhost. Source: `components/qr/qr-scanner.tsx:22-82`.
- No hover-only task controls were found because no task UI exists. For any future task actions, expose controls without hover (visible buttons or swipe/action sheet).
