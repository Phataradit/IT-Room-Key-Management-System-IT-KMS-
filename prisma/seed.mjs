import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const passwordHash = await bcrypt.hash("Admin123!", 12);
const demoPasswordHashes = {
  admin: passwordHash,
  teacher: await bcrypt.hash("Teacher123!", 12),
  student: await bcrypt.hash("Student123!", 12),
  schoolStudent: await bcrypt.hash("SchoolStudent123!", 12),
};

async function main() {
  const admin = await prisma.user.upsert({
    where: { username: "admin" },
    update: {},
    create: {
      username: "admin",
      email: "admin@itkms.local",
      passwordHash: demoPasswordHashes.admin,
      firstName: "ผู้ดูแล",
      lastName: "ระบบ",
      role: "ADMIN",
    },
  });

  const teacher = await prisma.user.upsert({
    where: { username: "teacher" },
    update: {},
    create: {
      username: "teacher",
      email: "teacher@itkms.local",
      passwordHash: demoPasswordHashes.teacher,
      firstName: "สมชาย",
      lastName: "ใจดี",
      employeeId: "T-0001",
      department: "เทคโนโลยีสารสนเทศ",
      role: "TEACHER",
    },
  });

  const student = await prisma.user.upsert({
    where: { username: "student" },
    update: {},
    create: {
      username: "student",
      email: "student@itkms.local",
      passwordHash: demoPasswordHashes.student,
      firstName: "กานดา",
      lastName: "นักเรียน",
      studentId: "S-0001",
      classRoom: "ปวช. 3/1",
      role: "STUDENT",
    },
  });

  await prisma.user.upsert({
    where: { username: "schoolstudent" },
    update: {},
    create: {
      username: "schoolstudent",
      email: "schoolstudent@itkms.local",
      passwordHash: demoPasswordHashes.schoolStudent,
      firstName: "มานะ",
      lastName: "นักเรียน",
      studentId: "S-0002",
      classRoom: "มัธยมศึกษา",
      role: "SCHOOL_STUDENT",
    },
  });

  const roomDefinitions = [
    ["251", "ห้อง 251", "ไม่ระบุ", "ไม่ระบุ", "OTHER"],
    ["252", "ห้อง 252", "ไม่ระบุ", "ไม่ระบุ", "OTHER"],
    ["253", "ห้อง 253", "ไม่ระบุ", "ไม่ระบุ", "OTHER"],
    ["831", "ห้อง 831", "ไม่ระบุ", "ไม่ระบุ", "OTHER"],
    ["832", "ห้อง 832", "ไม่ระบุ", "ไม่ระบุ", "OTHER"],
    ["751", "ห้อง 751", "ไม่ระบุ", "ไม่ระบุ", "OTHER"],
    ["821", "ห้อง 821", "ไม่ระบุ", "ไม่ระบุ", "OTHER"],
    ["823", "ห้อง 823", "ไม่ระบุ", "ไม่ระบุ", "OTHER"],
    ["851", "ห้อง 851", "ไม่ระบุ", "ไม่ระบุ", "OTHER"],
    ["841", "ห้อง 841", "ไม่ระบุ", "ไม่ระบุ", "OTHER"],
    ["243", "ห้อง 243", "ไม่ระบุ", "ไม่ระบุ", "OTHER"],
    ["861", "ห้อง 861", "ไม่ระบุ", "ไม่ระบุ", "OTHER"],
    ["862", "ห้อง 862", "ไม่ระบุ", "ไม่ระบุ", "OTHER"],
  ];
  const legacyRoomCodes = [
    "DB-01", "DB-02", "DB-03",
    "LAB-01", "LAB-02", "LAB-03",
    "SERVER-01", "CLASS-01", "CLASS-02", "CLASS-03",
  ];

  const rooms = [];
  for (const [roomCode, roomName, building, floor, roomType] of roomDefinitions) {
    const room = await prisma.room.upsert({
      where: { roomCode },
      update: { deletedAt: null },
      create: {
        roomCode,
        roomName,
        building,
        floor,
        roomType,
        qrToken: randomBytes(32).toString("base64url"),
        qrGeneratedAt: new Date(),
        keys: {
          create: {
            keyCode: `KEY-${roomCode}`,
            keyName: `กุญแจ ${roomCode}`,
          },
        },
      },
      include: { keys: true },
    });
    const roomKey = room.keys[0] ?? await prisma.roomKey.upsert({
      where: { keyCode: `KEY-${roomCode}` },
      update: {},
      create: {
        roomId: room.id,
        keyCode: `KEY-${roomCode}`,
        keyName: `กุญแจ ${roomCode}`,
      },
    });
    rooms.push({ ...room, keys: [roomKey] });
  }

  await prisma.room.updateMany({
    where: { roomCode: { in: legacyRoomCodes }, deletedAt: null },
    data: { deletedAt: new Date() },
  });

  for (const room of rooms) {
    await prisma.roomTeacher.upsert({
      where: { roomId_teacherId: { roomId: room.id, teacherId: teacher.id } },
      update: {},
      create: { roomId: room.id, teacherId: teacher.id },
    });
  }

  const days = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"];
  const subjects = ["Database Systems", "Web Programming", "Network Fundamentals", "IT Project"];
  const scheduleCount = await prisma.roomSchedule.count();
  if (scheduleCount === 0) {
    for (let index = 0; index < 20; index += 1) {
      const room = rooms[index % rooms.length];
      const startHour = 8 + (index % 4) * 2;
      await prisma.roomSchedule.create({
        data: {
          roomId: room.id,
          dayOfWeek: days[index % days.length],
          startTime: `${String(startHour).padStart(2, "0")}:00`,
          endTime: `${String(startHour + 2).padStart(2, "0")}:00`,
          subject: subjects[index % subjects.length],
          teacherName: "สมชาย ใจดี",
          className: `ปวช. ${1 + (index % 3)}/1`,
          semester: "1",
          academicYear: "2569",
        },
      });
    }
  }

  const borrowCount = await prisma.borrowTransaction.count();
  if (borrowCount === 0) {
    const now = new Date();
    for (let index = 0; index < 30; index += 1) {
      const borrowedAt = new Date(now);
      const isBorrowed = index === 23 || index === 24;
      const isOverdue = index === 25;
      const isCancelled = index >= 26;
      if (isBorrowed) {
        borrowedAt.setHours(now.getHours() - 1, now.getMinutes(), 0, 0);
      } else if (isOverdue) {
        borrowedAt.setHours(now.getHours() - 4, now.getMinutes(), 0, 0);
      } else {
        borrowedAt.setDate(now.getDate() - (index % 25));
        borrowedAt.setHours(8 + (index % 8), 0, 0, 0);
      }
      const room = rooms[index % rooms.length];
      const key = room.keys[0];
      const expectedReturnAt = new Date(borrowedAt.getTime() + 2 * 60 * 60 * 1000);
      const status = isCancelled
        ? "CANCELLED"
        : isBorrowed
          ? "BORROWED"
          : isOverdue
            ? "OVERDUE"
            : "RETURNED";

      const transaction = await prisma.borrowTransaction.create({
        data: {
          transactionNo: `BR-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}-${String(index + 1).padStart(4, "0")}`,
          userId: index % 2 === 0 ? student.id : teacher.id,
          roomId: room.id,
          borrowedAt,
          expectedReturnAt,
          returnedAt: status === "RETURNED" ? new Date(expectedReturnAt.getTime() - 15 * 60 * 1000) : null,
          status,
          purpose: subjects[index % subjects.length],
          approvedById: admin.id,
          approvedAt: borrowedAt,
          items: {
            create: {
              keyId: key.id,
              conditionBefore: "GOOD",
              conditionAfter: status === "RETURNED" ? "GOOD" : null,
            },
          },
        },
      });

      if (status === "BORROWED" || status === "OVERDUE") {
        await prisma.roomKey.update({
          where: { id: key.id },
          data: { status: "BORROWED" },
        });
        await prisma.room.update({
          where: { id: room.id },
          data: { status: "BORROWED" },
        });
      }

      if (index < 3) {
        await prisma.notification.create({
          data: {
            userId: transaction.userId,
            type: status === "OVERDUE" ? "OVERDUE" : "BORROW_SUCCESS",
            title: status === "OVERDUE" ? "รายการเกินกำหนด" : "ยืมกุญแจสำเร็จ",
            message: `รายการ ${transaction.transactionNo} · ห้อง ${room.roomCode}`,
            referenceId: transaction.id,
          },
        });
      }
    }
  }

  const defaultSettings = [
    ["system_name", "IT Room Key Management System", "ชื่อระบบ"],
    ["school_name", "วิทยาลัยพณิชยการธนบุรี", "ชื่อสถานศึกษา"],
    ["default_borrow_duration", "120", "ระยะเวลายืมเริ่มต้น หน่วยเป็นนาที"],
    ["overdue_notification_minutes", "15", "แจ้งเตือนก่อนครบกำหนด หน่วยเป็นนาที"],
    ["allow_student_borrow", "true", "อนุญาตให้นักเรียนยืม"],
    ["allow_teacher_borrow", "true", "อนุญาตให้ครูยืม"],
    ["allow_user_return", "true", "อนุญาตให้คืนกุญแจ"],
    ["maintenance_mode", "false", "ปิดระบบเพื่อบำรุงรักษา"],
  ];
  for (const [key, value, description] of defaultSettings) {
    await prisma.systemSetting.upsert({
      where: { key },
      update: {},
      create: { key, value, description },
    });
  }

  console.info("Seed complete. Demo accounts: admin, teacher, student, schoolstudent.");
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
