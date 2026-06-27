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
const headers = { apikey: key, Authorization: "Bearer " + key, Accept: "application/openapi+json" };

const res = await fetch(url + "/rest/v1/", { headers });
const schema = await res.json();

// Try different schema locations
function findTable(name, obj, depth = 0) {
  if (depth > 3) return null;
  if (!obj || typeof obj !== "object") return null;
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const r = findTable(name, item, depth);
      if (r) return r;
    }
    return null;
  }
  for (const [key, val] of Object.entries(obj)) {
    if (key === name || key.endsWith("/" + name)) return val;
    const r = findTable(name, val, depth + 1);
    if (r) return r;
  }
  return null;
}

// Check components/schemas
const schemas = schema?.components?.schemas || schema?.definitions || {};
const tables = ["notifications", "schedule_slots", "sessions", "payments", "attendances", "subjects", "group_students"];

for (const t of tables) {
  const def = schemas[t] || schemas[t + "_view"] || findTable(t, schema);
  if (def?.properties) {
    console.log(t + ":");
    for (const [col, info] of Object.entries(def.properties)) {
      const required = def.required?.includes(col);
      console.log(`  ${col} ${info.type || "?"}${required ? " REQUIRED" : ""}${info.default !== undefined ? " default=" + info.default : ""}`);
    }
  } else {
    console.log(t + ": schema not found");
  }
}
