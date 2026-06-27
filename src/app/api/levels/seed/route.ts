import { NextResponse } from "next/server";
import { getTenantContext } from "@/lib/auth";

const DEFAULT_LEVELS = [
  { nameAr: "أولى ابتدائي", nameFr: "1ère Primaire", nameEn: "1st Primary", cycle: "primary" },
  { nameAr: "ثانية ابتدائي", nameFr: "2ème Primaire", nameEn: "2nd Primary", cycle: "primary" },
  { nameAr: "ثالثة ابتدائي", nameFr: "3ème Primaire", nameEn: "3rd Primary", cycle: "primary" },
  { nameAr: "رابعة ابتدائي", nameFr: "4ème Primaire", nameEn: "4th Primary", cycle: "primary" },
  { nameAr: "خامسة ابتدائي", nameFr: "5ème Primaire", nameEn: "5th Primary", cycle: "primary" },
  { nameAr: "أولى متوسط", nameFr: "1ère AM", nameEn: "1st Middle", cycle: "middle" },
  { nameAr: "ثانية متوسط", nameFr: "2ème AM", nameEn: "2nd Middle", cycle: "middle" },
  { nameAr: "ثالثة متوسط", nameFr: "3ème AM", nameEn: "3rd Middle", cycle: "middle" },
  { nameAr: "رابعة متوسط", nameFr: "4ème AM", nameEn: "4th Middle", cycle: "middle" },
  { nameAr: "أولى ثانوي", nameFr: "1ère AS", nameEn: "1st Secondary", cycle: "secondary" },
  { nameAr: "ثانية ثانوي", nameFr: "2ème AS", nameEn: "2nd Secondary", cycle: "secondary" },
  { nameAr: "ثالثة ثانوي", nameFr: "3ème AS", nameEn: "3rd Secondary", cycle: "secondary" },
];

export async function POST() {
  try {
    const { tenantId, supabase } = await getTenantContext();

    const { count } = await supabase
      .from("levels")
      .select("*", { count: "exact", head: true })
      .eq("tenantId", tenantId);

    if (count && count > 0) {
      return NextResponse.json({ message: "Levels already seeded", count });
    }

    const rows = DEFAULT_LEVELS.map((l, i) => ({
      id: crypto.randomUUID(),
      tenantId,
      nameAr: l.nameAr,
      nameFr: l.nameFr,
      nameEn: l.nameEn,
      cycle: l.cycle,
      sortOrder: i,
      status: "active",
    }));

    const { error } = await supabase.from("levels").insert(rows);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, count: rows.length });
  } catch {
    return NextResponse.json({ error: "Failed to seed levels" }, { status: 500 });
  }
}
