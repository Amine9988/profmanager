"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { ZoomIn, ZoomOut, Maximize2, Minus } from "lucide-react";
import { CardRenderer } from "./card-templates";
import type { StudentCardData, TenantCardData, CardTemplate, CardSize } from "./types";
import { CARD_A7 } from "./types";

interface CardPreviewProps {
  students: StudentCardData[];
  tenant: TenantCardData;
  template: CardTemplate;
  cardSize: CardSize;
}

const A7_PX = { width: Math.round(85 * 3.779), height: Math.round(55 * 3.779) };

export function CardPreview({ students, tenant, template, cardSize }: CardPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [fitMode, setFitMode] = useState(false);

  const cardPx = cardSize.width === 85 && cardSize.height === 55
    ? A7_PX
    : { width: Math.round(cardSize.width * 3.779), height: Math.round(cardSize.height * 3.779) };

  const fitToWidth = useCallback(() => {
    if (containerRef.current) {
      const containerW = containerRef.current.clientWidth - 40;
      const scale = containerW / cardPx.width;
      setZoom(Math.min(scale, 4));
      setFitMode(true);
    }
  }, [cardPx.width]);

  useEffect(() => {
    if (fitMode) fitToWidth();
  }, [fitMode, fitToWidth, students.length]);

  useEffect(() => {
    const handleResize = () => { if (fitMode) fitToWidth(); };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [fitMode, fitToWidth]);

  const zoomIn = () => { setZoom((z) => Math.min(z + 0.15, 4)); setFitMode(false); };
  const zoomOut = () => { setZoom((z) => Math.max(z - 0.15, 0.3)); setFitMode(false); };

  if (students.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
        اختر التلاميذ لعرض البطاقات
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <button onClick={zoomOut} className="p-1.5 rounded hover:bg-muted" title="تصغير"><ZoomOut className="size-4" /></button>
          <span className="text-xs text-muted-foreground min-w-[4em] text-center tabular-nums">{Math.round(zoom * 100)}%</span>
          <button onClick={zoomIn} className="p-1.5 rounded hover:bg-muted" title="تكبير"><ZoomIn className="size-4" /></button>
          <button onClick={fitToWidth} className="p-1.5 rounded hover:bg-muted" title="ملء العرض"><Maximize2 className="size-4" /></button>
        </div>
        <span className="text-xs text-muted-foreground">{students.length} بطاقة</span>
      </div>

      <div
        ref={containerRef}
        className="relative overflow-auto rounded-xl border bg-muted/30 p-5 min-h-[300px]"
        style={{ direction: "ltr" }}
      >
        <div
          className="flex flex-wrap gap-4 mx-auto transition-transform duration-100"
          style={{
            transform: `scale(${zoom})`,
            transformOrigin: "top right",
            direction: "rtl",
            width: students.length === 1 ? cardPx.width : undefined,
          }}
        >
          {students.map((s) => (
            <div
              key={s.id}
              className="shadow-md rounded-lg overflow-hidden bg-white"
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
    </div>
  );
}
