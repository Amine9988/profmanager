import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

try {
  const env = readFileSync(resolve(__dirname, "../.env"), "utf-8");
  for (const line of env.split("\n")) {
    const match = line.match(/^\s*([^#=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      let value = match[2].trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  }
} catch {}

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const userId = "20a32140-7629-47f5-b292-c6176734211b";

const { data: tu } = await admin
  .from("tenant_users")
  .select("*, tenants(*)")
  .eq("userId", userId);

console.log("Tenant users:", JSON.stringify(tu, null, 2));

const { data: u } = await admin
  .from("users")
  .select("*")
  .eq("id", userId);

console.log("User record:", JSON.stringify(u, null, 2));
