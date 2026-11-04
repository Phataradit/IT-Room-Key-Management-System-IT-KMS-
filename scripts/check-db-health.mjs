#!/usr/bin/env node
/**
 * Database Health Check Script
 *
 * ตรวจสอบการเชื่อมต่อฐานข้อมูลและบัญชีผู้ใช้สำหรับ IT-KMS
 *
 * ใช้งาน:
 *   node --env-file=.env scripts/check-db-health.mjs
 *
 * หมายเหตุ: สคริปต์นี้ไม่แสดง Password Hash, Connection String หรือข้อมูลลับ
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function checkDatabaseConnection() {
  console.log("=== IT-KMS Database Health Check ===\n");

  // 1. ตรวจสอบว่า DATABASE_URL ถูกตั้งค่า (ไม่แสดงค่าจริง)
  const hasDbUrl = Boolean(process.env.DATABASE_URL);
  console.log(`[1] DATABASE_URL configured: ${hasDbUrl ? "YES" : "NO - MISSING!"}`);
  if (!hasDbUrl) {
    console.error("   ❌ DATABASE_URL is not set. Cannot connect to database.");
    return;
  }

  // แสดงเฉพาะ host (ซ่อน credentials)
  try {
    const url = new URL(process.env.DATABASE_URL);
    console.log(`    Host: ${url.hostname}`);
    console.log(`    Database: ${url.pathname.replace("/", "")}`);
    console.log(`    SSL: ${url.searchParams.get("sslmode") || "(not specified)"}`);
  } catch {
    console.log("    (Could not parse DATABASE_URL as URL)");
  }

  // 2. ทดสอบการเชื่อมต่อ
  console.log("\n[2] Testing database connection...");
  try {
    await prisma.$queryRaw`SELECT 1 AS ok`;
    console.log("    ✅ Connection successful");
  } catch (error) {
    console.error("    ❌ Connection failed:", error.message);
    return;
  }

  // 3. ตรวจสอบ Migration Status
  console.log("\n[3] Checking migration status...");
  try {
    const migrations = await prisma.$queryRaw`
      SELECT "migration_name", "finished_at"
      FROM "_prisma_migrations"
      ORDER BY "finished_at" ASC
    `;
    console.log(`    ✅ ${migrations.length} migration(s) applied:`);
    for (const m of migrations) {
      console.log(`       - ${m.migration_name} (${m.finished_at?.toISOString() ?? "pending"})`);
    }
  } catch (error) {
    console.error("    ⚠️  Could not read _prisma_migrations:", error.message);
  }

  // 4. ตรวจสอบว่าตาราง User มีอยู่และมีข้อมูล
  console.log("\n[4] Checking User table...");
  try {
    const userCount = await prisma.user.count();
    console.log(`    Total users: ${userCount}`);

    const activeCount = await prisma.user.count({
      where: { status: "ACTIVE", deletedAt: null },
    });
    console.log(`    Active users (not deleted): ${activeCount}`);
  } catch (error) {
    console.error("    ❌ Cannot query User table:", error.message);
    return;
  }

  // 5. ตรวจสอบบัญชี teacher โดยเฉพาะ (ไม่แสดง passwordHash)
  console.log('\n[5] Looking up "teacher" account...');
  try {
    const teacher = await prisma.user.findFirst({
      where: {
        OR: [{ username: "teacher" }, { email: "teacher@itkms.local" }],
      },
      select: {
        id: true,
        username: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        status: true,
        deletedAt: true,
        lastLoginAt: true,
        createdAt: true,
        // passwordHash deliberately excluded
      },
    });

    if (!teacher) {
      console.log("    ❌ Account NOT FOUND in database!");
      console.log("    → This is the likely cause of login failure.");
      console.log('    → Run: npm run db:seed  (with production DATABASE_URL)');
    } else {
      console.log(`    ✅ Account found:`);
      console.log(`       ID:        ${teacher.id}`);
      console.log(`       Username:  ${teacher.username}`);
      console.log(`       Email:     ${teacher.email}`);
      console.log(`       Name:      ${teacher.firstName} ${teacher.lastName}`);
      console.log(`       Role:      ${teacher.role}`);
      console.log(`       Status:    ${teacher.status}`);
      console.log(`       Deleted:   ${teacher.deletedAt ? teacher.deletedAt.toISOString() : "No"}`);
      console.log(`       Last Login: ${teacher.lastLoginAt?.toISOString() ?? "Never"}`);
      console.log(`       Created:   ${teacher.createdAt.toISOString()}`);

      // ตรวจสอบว่าจะผ่าน authorize() ได้หรือไม่
      const issues = [];
      if (teacher.status !== "ACTIVE") {
        issues.push(`Status is "${teacher.status}" (must be "ACTIVE")`);
      }
      if (teacher.deletedAt !== null) {
        issues.push("Account is soft-deleted (deletedAt is set)");
      }

      if (issues.length > 0) {
        console.log("\n    ⚠️  Login will FAIL because:");
        for (const issue of issues) {
          console.log(`       - ${issue}`);
        }
      } else {
        console.log("\n    ✅ Status checks OK — login should work if password is correct.");
      }

      // ตรวจสอบว่ามี passwordHash หรือไม่ (ไม่แสดงค่า)
      const hashCheck = await prisma.user.findFirst({
        where: { username: "teacher" },
        select: { passwordHash: true },
      });
      const hasHash = Boolean(hashCheck?.passwordHash);
      const hashLength = hashCheck?.passwordHash?.length ?? 0;
      console.log(`    Password hash exists: ${hasHash ? "YES" : "NO"}`);
      console.log(`    Password hash length: ${hashLength}`);
      if (hasHash && hashLength >= 59) {
        const hashPrefix = hashCheck.passwordHash.substring(0, 7);
        console.log(`    Hash prefix: ${hashPrefix}... (bcrypt identifier)`);
        if (!hashPrefix.startsWith("$2")) {
          console.log("    ⚠️  Hash does not look like bcrypt format!");
        }
      } else if (hasHash) {
        console.log("    ⚠️  Hash seems too short for bcrypt!");
      }
    }
  } catch (error) {
    console.error("    ❌ Error looking up teacher:", error.message);
  }

  // 6. ตรวจสอบบัญชี admin ด้วย
  console.log('\n[6] Looking up "admin" account...');
  try {
    const admin = await prisma.user.findFirst({
      where: { username: "admin" },
      select: {
        username: true,
        role: true,
        status: true,
        deletedAt: true,
      },
    });
    if (!admin) {
      console.log("    ❌ Admin account NOT FOUND");
    } else {
      console.log(`    Username: ${admin.username}, Role: ${admin.role}, Status: ${admin.status}, Deleted: ${admin.deletedAt ? "Yes" : "No"}`);
    }
  } catch (error) {
    console.error("    ❌ Error:", error.message);
  }

  // 7. ตรวจสอบ NEXTAUTH env vars (ไม่แสดง secret จริง)
  console.log("\n[7] Checking auth environment variables...");
  console.log(`    NEXTAUTH_URL:    ${process.env.NEXTAUTH_URL ?? "NOT SET"}`);
  console.log(`    NEXTAUTH_SECRET: ${process.env.NEXTAUTH_SECRET ? "SET (hidden)" : "NOT SET!"}`);

  console.log("\n=== Health Check Complete ===");
}

checkDatabaseConnection()
  .catch((error) => {
    console.error("Health check failed:", error.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
