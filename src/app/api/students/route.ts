import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const { tenantId, supabase } = await getTenantContext();
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const search = searchParams.get("search") || searchParams.get("q") || "";
    const pageParam = searchParams.get("page");
    const limitParam = searchParams.get("limit");
    const hasPagination = pageParam !== null || limitParam !== null || !!search;
    const page = Math.max(1, parseInt(pageParam || "1", 10) || 1);
    const limit = Math.min(500, Math.max(1, parseInt(limitParam || "100", 10) || 100));
    const offset = (page - 1) * limit;

    let query = supabase
      .from("students")
      .select("id, fullName, monthlyFee, advanceBalance, status")
      .eq("tenantId", tenantId)
      .order("fullName", { ascending: true });

    if (status) query = query.eq("status", status);
    if (search) query = query.ilike("fullName", `%${search}%`);

    // Enforce pagination at scale — 10k without limit freezes payload + DOM
    if (hasPagination) {
      query = query.range(offset, offset + limit - 1);
      // Also get total for pagination UI
      let countQ = supabase.from("students").select("id", { count: "exact", head: true }).eq("tenantId", tenantId);
      if (status) countQ = countQ.eq("status", status);
      if (search) countQ = countQ.ilike("fullName", `%${search}%`);
      const { count } = await countQ as any;
      const { data: students } = await query;
      return NextResponse.json(students || [], { headers: { "X-Total-Count": String(count ?? 0) } });
    }

    // Backward compat: cap at 500 when no pagination requested to avoid 10k blowup
    query = query.limit(500);
    const { data: students } = await query;
    return NextResponse.json(students || []);
  } catch {
    return NextResponse.json({ error: "Failed to fetch students" }, { status: 500 });
  }
}
