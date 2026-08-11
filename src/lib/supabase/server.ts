import { createLocalClient } from "@/lib/db/supabase-shim";

export async function createClient() {
  return createLocalClient();
}
