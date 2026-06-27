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

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const headers = { apikey: key, Authorization: "Bearer " + key, Accept: "application/json" };

async function checkTable(table) {
  const res = await fetch(url + "/rest/v1/" + table + "?limit=0", { headers });
  const body = await res.text();
  console.log(table + " status=" + res.status);
  if (res.ok) {
    const columnsHeader = res.headers.get("content-range");
    const preferHeader = res.headers.get("preference-applied");
    console.log("  content-range: " + columnsHeader);
    console.log("  preference-applied: " + preferHeader);
  }
  // Try to parse as JSON for error message
  try { console.log("  " + JSON.stringify(JSON.parse(body), null, 2).substring(0, 500)); } catch {}
  console.log("");
}

await checkTable("notifications");
await checkTable("schedule_slots");
await checkTable("sessions");
await checkTable("payments");
await checkTable("attendances");
await checkTable("subjects");
