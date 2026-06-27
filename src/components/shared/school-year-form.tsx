"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, CheckCircle2 } from "lucide-react";

export function SchoolYearForm({ initialSettings }: { initialSettings?: { schoolYearStart?: string | null; schoolYearEnd?: string | null } }) {
  const [schoolYearStart, setSchoolYearStart] = useState(
    initialSettings?.schoolYearStart ?? ""
  );
  const [schoolYearEnd, setSchoolYearEnd] = useState(
    initialSettings?.schoolYearEnd ?? ""
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    setSaving(true);

    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        schoolYearStart,
        schoolYearEnd,
      }),
    });

    const data = await res.json();

    if (res.ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } else {
      alert("خطأ في الحفظ: " + data.error);
    }
    setSaving(false);
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>بداية السنة الدراسية</Label>
        <Input
          type="date"
          value={schoolYearStart}
          onChange={(e) => setSchoolYearStart(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label>نهاية السنة الدراسية</Label>
        <Input
          type="date"
          value={schoolYearEnd}
          onChange={(e) => setSchoolYearEnd(e.target.value)}
        />
      </div>

      <Button onClick={handleSave} disabled={saving} variant={saved ? "outline" : "default"}>
        {saving ? <Loader2 className="size-4 mr-1 animate-spin" /> : saved ? <CheckCircle2 className="size-4 mr-1" /> : null}
        {saving ? "جاري الحفظ..." : saved ? "تم الحفظ" : "حفظ"}
      </Button>
    </div>
  );
}
