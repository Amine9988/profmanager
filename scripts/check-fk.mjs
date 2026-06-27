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

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const tables = [
  ["students", "group_students", "groups"],
  ["groups", "group_students", "students"],
  ["groups", "schedule_slots"],
  ["groups", "sessions"],
  ["groups", "subjects"],
];

for (const [main, ...rest] of tables) {
  // Pattern 1: simple
  const embed1 = rest.map(r => `${r}(*)`).join(", ");
  const { error: e1 } = await supabase.from(main).select(`id, ${embed1}`).limit(1);
  console.log(`${main} → ${rest.join(", ")} (simple):`, e1?.message ?? "OK");

  // Pattern 2: nested with sub-joins
  if (rest.length === 2) {
    const [t1, t2] = rest;
    const embed2 = `${t1}(*, ${t2}(*))`;
    const { error: e2 } = await supabase.from(main).select(`id, ${embed2}`).limit(1);
    console.log(`${main} → ${t1} → ${t2} (nested):`, e2?.message ?? "OK");
  }
}

