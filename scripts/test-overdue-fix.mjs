import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

try {
  const env = readFileSync(resolve(__dirname, "../.env"), "utf-8");
  for (const line of env.split("\n")) {
    const m = line.match(/^\s*([^#=]+)=(.*)$/);
    if (m) {
      const key = m[1].trim();
      let val = m[2].trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
      if (!process.env[key]) process.env[key] = val;
    }
  }
} catch {}

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const TENANT_ID = "7a5306fc-bf2d-4101-8bcd-fd2a97c52150";

// --- Helpers (mirrors src/lib/payments/overdue.ts) ---
function isPaymentOverdue(amountDue, amountPaid, month) {
  if (amountPaid >= amountDue) return false;
  const monthDate = new Date(month);
  const now = new Date();
  const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
  if (now > monthEnd) return true;
  if (now.getDate() > 10) return true;
  return false;
}

function calculateStatus(amountDue, amountPaid, month) {
  if (amountPaid >= amountDue) return "paid";
  if (amountPaid > 0) return "partial";
  const now = new Date();
  const monthDate = new Date(month);
  const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
  if (now > monthEnd) return "overdue";
  if (now.getDate() > 10) return "overdue";
  return "pending";
}

function getLastMonthFirstDay() {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  d.setDate(1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

async function main() {
  console.log("=== OVERDUE FIX VERIFICATION TEST ===\n");

  // --- Clean up any leftover test data ---
  const { data: existingTestStudents } = await admin
    .from("students")
    .select("id")
    .eq("tenantId", TENANT_ID)
    .in("fullName", ["Test Student A (Overdue)", "Test Student B (Partial Overdue)"]);

  for (const s of existingTestStudents || []) {
    await admin.from("payments").delete().eq("studentId", s.id);
    await admin.from("group_students").delete().eq("studentId", s.id);
    await admin.from("students").delete().eq("id", s.id);
  }
  console.log("Cleaned up previous test data\n");

  // --- Step 1: Create Student A (no payment recorded) ---
  const studentAId = crypto.randomUUID();
  const { error: errA } = await admin.from("students").insert({
    id: studentAId,
    tenantId: TENANT_ID,
    fullName: "Test Student A (Overdue)",
    monthlyFee: 4000,
    billingType: "monthly",
    status: "active",
    enrolledAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  if (errA) { console.log("ERROR creating Student A:", errA.message); process.exit(1); }
  console.log("✓ Created Student A — monthly fee: 4000 DZD");

  // --- Step 2: Generate an invoice for last month, no payment ---
  const lastMonth = getLastMonthFirstDay();
  const { error: errInvA } = await admin.from("payments").insert({
    id: crypto.randomUUID(),
    tenantId: TENANT_ID,
    studentId: studentAId,
    month: lastMonth,
    amountDue: 4000,
    amountPaid: 0,
    status: calculateStatus(4000, 0, lastMonth),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  if (errInvA) { console.log("ERROR creating invoice for A:", errInvA.message); process.exit(1); }
  console.log(`✓ Created invoice for ${lastMonth} — Student A: amountDue=4000, amountPaid=0`);

  // Verify dynamic overdue detection
  const overdueA = isPaymentOverdue(4000, 0, lastMonth);
  console.log(`  → isPaymentOverdue(4000, 0, ${lastMonth}) = ${overdueA} ${overdueA ? "✓" : "✗ SHOULD BE TRUE"}`);

  // --- Step 3: Create Student B (partially paid) ---
  const studentBId = crypto.randomUUID();
  const { error: errB } = await admin.from("students").insert({
    id: studentBId,
    tenantId: TENANT_ID,
    fullName: "Test Student B (Partial Overdue)",
    monthlyFee: 4000,
    billingType: "monthly",
    status: "active",
    enrolledAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  if (errB) { console.log("ERROR creating Student B:", errB.message); process.exit(1); }
  console.log("\n✓ Created Student B — monthly fee: 4000 DZD");

  // --- Step 4: Generate invoice for last month with partial payment (2000 DZD) ---
  const { error: errInvB } = await admin.from("payments").insert({
    id: crypto.randomUUID(),
    tenantId: TENANT_ID,
    studentId: studentBId,
    month: lastMonth,
    amountDue: 4000,
    amountPaid: 2000,
    status: calculateStatus(4000, 2000, lastMonth),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  if (errInvB) { console.log("ERROR creating invoice for B:", errInvB.message); process.exit(1); }
  console.log(`✓ Created invoice for ${lastMonth} — Student B: amountDue=4000, amountPaid=2000 (partial)`);

  // Verify dynamic overdue detection for partial payment
  const overdueB = isPaymentOverdue(4000, 2000, lastMonth);
  console.log(`  → isPaymentOverdue(4000, 2000, ${lastMonth}) = ${overdueB} ${overdueB ? "✓" : "✗ SHOULD BE TRUE"}`);

  // --- Step 5: Query the overdue list using the NEW logic ---
  console.log("\n--- Simulating getOverdueSubscriptions() ---");

  const now = new Date();
  const firstOfCurrentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

  const { data: allPayments } = await admin
    .from("payments")
    .select("*, students(fullName, phone)")
    .eq("tenantId", TENANT_ID)
    .lte("month", firstOfCurrentMonth)
    .in("studentId", [studentAId, studentBId]);

  const byStudent = new Map();
  for (const p of allPayments || []) {
    const amountDue = Number(p.amountDue);
    const amountPaid = Number(p.amountPaid);
    if (!isPaymentOverdue(amountDue, amountPaid, p.month)) continue;

    const existing = byStudent.get(p.studentId);
    const monthDate = new Date(p.month);
    const daysOverdue = Math.ceil((now.getTime() - monthDate.getTime()) / (1000 * 60 * 60 * 24));

    if (existing) {
      existing.monthlyAmount += amountDue;
      existing.amountPaid += amountPaid;
      existing.remainingBalance += (amountDue - amountPaid);
    } else {
      const { data: gs } = await admin
        .from("group_students")
        .select("groups(name)")
        .eq("studentId", p.studentId)
        .eq("status", "active");

      byStudent.set(p.studentId, {
        studentName: p.students.fullName,
        monthlyAmount: amountDue,
        amountPaid,
        remainingBalance: amountDue - amountPaid,
        daysOverdue,
        groups: (gs || []).map(g => g.groups?.name ?? "?"),
        endDate: monthDate,
        month: p.month,
      });
    }
  }

  const results = Array.from(byStudent.values()).sort((a, b) => b.daysOverdue - a.daysOverdue);

  console.log(`\nOverdue students found: ${results.length}`);
  for (const r of results) {
    console.log(`\n--- ${r.studentName} ---`);
    console.log(`  Amount Due:      ${r.monthlyAmount} DZD`);
    console.log(`  Amount Paid:     ${r.amountPaid} DZD`);
    console.log(`  Remaining:       ${r.remainingBalance} DZD`);
    console.log(`  Days Overdue:    ${r.daysOverdue}d`);
    console.log(`  Month:           ${r.month}`);
    console.log(`  Groups:          ${r.groups.join(", ") || "(none)"}`);
  }

  // --- Step 6: Verify ---
  let passed = 0;
  let failed = 0;

  // Check Student A is in results
  const studentAResult = results.find(r => r.studentName === "Test Student A (Overdue)");
  if (studentAResult) {
    console.log(`\n✓ PASS: Student A appears in overdue list`);
    console.log(`  → Amount Due: ${studentAResult.monthlyAmount} DZD`);
    console.log(`  → Remaining: ${studentAResult.remainingBalance} DZD`);
    passed++;
  } else {
    console.log(`\n✗ FAIL: Student A should appear in overdue list but does not`);
    failed++;
  }

  // Check Student B is in results
  const studentBResult = results.find(r => r.studentName === "Test Student B (Partial Overdue)");
  if (studentBResult) {
    console.log(`\n✓ PASS: Student B appears in overdue list`);
    console.log(`  → Amount Due: ${studentBResult.monthlyAmount} DZD`);
    console.log(`  → Remaining: ${studentBResult.remainingBalance} DZD (should be 2000)`);
    if (studentBResult.remainingBalance === 2000) {
      console.log(`  → Remaining balance correct ✓`);
      passed++;
    } else {
      console.log(`  → Remaining balance WRONG (expected 2000, got ${studentBResult.remainingBalance}) ✗`);
      failed++;
    }
    passed++;
  } else {
    console.log(`\n✗ FAIL: Student B should appear in overdue list but does not`);
    failed++;
  }

  // Check Student B has correct remaining balance
  if (studentBResult && studentBResult.remainingBalance === 2000) {
    console.log(`✓ PASS: Student B remaining balance = 2000 DZD (correct for partial payment)`);
    passed++;
  } else if (studentBResult) {
    console.log(`✗ FAIL: Student B remaining balance = ${studentBResult.remainingBalance} DZD (expected 2000)`);
    failed++;
  }

  console.log(`\n=== RESULTS: ${passed} passed, ${failed} failed ===`);

  // --- Cleanup ---
  await admin.from("payments").delete().eq("studentId", studentAId);
  await admin.from("payments").delete().eq("studentId", studentBId);
  await admin.from("group_students").delete().eq("studentId", studentAId);
  await admin.from("group_students").delete().eq("studentId", studentBId);
  await admin.from("students").delete().eq("id", studentAId);
  await admin.from("students").delete().eq("id", studentBId);
  console.log("\nCleaned up test data");

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
