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

const TENANT = "7a5306fc-bf2d-4101-8bcd-fd2a97c52150";
const now = new Date();
const y = now.getFullYear();
const m = String(now.getMonth() + 1).padStart(2, "0");
const firstOfMonth = `${y}-${m}-01`;
console.log("First of month:", firstOfMonth);

const [{ count: students }, { count: groups }, { data: monthPayments, count: mCount }, { data: allPayments }, { data: dailyPayments }] = await Promise.all([
  admin.from("students").select("*", { count: "exact", head: true }).eq("tenantId", TENANT).eq("status", "active"),
  admin.from("groups").select("*", { count: "exact", head: true }).eq("tenantId", TENANT).eq("status", "active"),
  admin.from("payments").select("*", { count: "exact" }).eq("tenantId", TENANT).eq("month", firstOfMonth),
  admin.from("payments").select("amountPaid, amountDue").eq("tenantId", TENANT),
  admin.from("payments").select("id, studentId, amountPaid, status").eq("tenantId", TENANT).eq("month", firstOfMonth).not("paidAt", "is", null),
]);

console.log("Active students:", students);
console.log("Active groups:", groups);
console.log("Month payments count:", mCount, "data:", JSON.stringify(monthPayments));
console.log("All payments rows:", allPayments?.length);
console.log("Daily payments:", dailyPayments?.length);
