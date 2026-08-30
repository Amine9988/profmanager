"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { StudentSelector } from "./student-selector";
import { CardPreview } from "./card-preview";
import { ExportActions } from "./export-actions";
import { CardRenderer } from "./card-templates";
import type { StudentCardData, TenantCardData, CardTemplate } from "./types";
import { TEMPLATES, CARD_A7 } from "./types";
import { getCardFormat, setCardFormat, ensureLanBase, type CardFormat } from "@/lib/scan-base";

interface StudentCardsClientProps {
  students: StudentCardData[];
  tenant: TenantCardData;
  levels: string[];
}

export function StudentCardsClient({ tenant, levels }: StudentCardsClientProps) {
  const [template, setTemplate] = useState<CardTemplate>("classic");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedStudents, setSelectedStudents] = useState<StudentCardData[]>([]);
  const [cardFormat, setCardFormatState] = useState<CardFormat>("url");
  const [, setLanReady] = useState(false);

  useEffect(() => {
    const f = getCardFormat();
    if (f !== "url") setCardFormatState(f);
  }, []);

  useEffect(() => {
    let mounted = true;
    ensureLanBase().then(() => {
      if (mounted) setLanReady(true);
    });
    return () => {
      mounted = false;
    };
  }, []);
  const cardRefMap = useRef(new Map<string, HTMLDivElement | null>());

  const cardPx = { width: Math.round(CARD_A7.width * 3.779), height: Math.round(CARD_A7.height * 3.779) };

  // Preview only first 20 in UI; print root keeps all selected (capped at 100 by selector)
  const previewStudents = useMemo(() => selectedStudents.slice(0, 20), [selectedStudents]);

  return (
    <div dir="rtl" className="flex flex-col gap-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold tracking-tight">بطاقات التلاميذ</h1>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-full border bg-muted/40 p-1 text-xs">
            <button
              onClick={() => { setCardFormat("code"); setCardFormatState("code"); }}
              className={`rounded-full px-3 py-1.5 transition ${
                cardFormat === "code" ? "bg-primary text-primary-foreground font-semibold" : "text-muted-foreground"
              }`}
              title="رمز بسيط فقط — يقرؤه قارئ USB بسرعة"
            >
              رمز بسيط (قارئ USB)
            </button>
            <button
              onClick={() => { setCardFormat("url"); setCardFormatState("url"); }}
              className={`rounded-full px-3 py-1.5 transition ${
                cardFormat === "url" ? "bg-primary text-primary-foreground font-semibold" : "text-muted-foreground"
              }`}
              title="رابط كامل — يفتح تلقائياً في كاميرا الهاتف"
            >
              رابط (هاتف)
            </button>
          </div>
          <select
            className="h-9 rounded-lg border border-input bg-background px-3 text-sm shadow-sm"
            value={template}
            onChange={(e) => setTemplate(e.target.value as CardTemplate)}
          >
            {TEMPLATES.map((t) => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </select>
          <ExportActions
            students={selectedStudents}
            tenant={tenant}
            template={template}
            cardRefs={cardRefMap}
          />
        </div>
      </div>

      <StudentSelector
        students={[]}
        selectedIds={selectedIds}
        selectedStudents={selectedStudents}
        onSelectionChange={(ids, list) => {
          setSelectedIds(ids);
          setSelectedStudents(list);
        }}
        levels={levels}
      />

      <CardPreview
        students={previewStudents}
        tenant={tenant}
        template={template}
        cardSize={CARD_A7}
      />

      <div
        id="sc-print-root"
        className="pointer-events-none"
        aria-hidden="false"
        style={{ position: "fixed", left: -10000, top: 0, zIndex: -1 }}
      >
        {selectedStudents.map((s) => (
          <div
            key={s.id}
            id={"sc-card-" + s.id}
            ref={(el) => { cardRefMap.current.set(s.id, el); }}
            style={{ width: cardPx.width, height: cardPx.height }}
          >
            <CardRenderer
              student={s}
              tenant={tenant}
              template={template}
              width={cardPx.width}
              height={cardPx.height}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
