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

// Try to get a sample row to see columns
const { data: sample, error: sampleErr } = await admin.from("students").select("*").limit(1);
console.log("Sample error:", sampleErr?.message ?? "none");
console.log("Sample keys:", sample && sample.length > 0 ? Object.keys(sample[0]).join(", ") : "no data");
console.log("Sample:", JSON.stringify(sample, null, 2));

// Try inserting WITH all required columns — mirrors the fix
const uuid = crypto.randomUUID();
const now = new Date().toISOString();
const { data: testInsert, error: testErr } = await admin.from("students").insert({
  id: uuid,
  tenantId: "7a5306fc-bf2d-4101-8bcd-fd2a97c52150",
  fullName: "Test Student " + uuid.slice(0, 8),
  monthlyFee: 0,
  status: "active",
  enrolledAt: now,
  createdById: "20a32140-7629-47f5-b292-c6176734211b",
  createdAt: now,
  updatedAt: now,
}).select();
console.log("\nTest insert error:", testErr?.message ?? "none");
console.log("Test insert:", JSON.stringify(testInsert, null, 2));

// Clean up test row
if (testInsert && testInsert.length > 0) {
  await admin.from("students").delete().eq("id", uuid);
  console.log("Cleaned up test row");
}
