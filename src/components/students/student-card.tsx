"use client";

import { useRef, useEffect } from "react";
import { generateQRCode } from "@/lib/qrcode-gen";
import { studentQrValue } from "@/lib/student-qr";

interface StudentCardData {
  id: string;
  fullName: string;
  gradeLevel?: string | null;
  schoolPhone?: string | null;
}

interface CardLayoutProps {
  student: StudentCardData;
  schoolName?: string | null;
  schoolLogo?: string | null;
}

function StudentQrCode({ value }: { value: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) {
      try {
        const svg = generateQRCode(value, 2).replace(/width="[^"]*" height="[^"]*"/, `width="100%" height="auto"`);
        ref.current.innerHTML = svg;
      } catch {
        ref.current.innerHTML = "";
      }
    }
  }, [value]);
  return <div ref={ref} style={{ width: "100%", height: "auto", display: "block" }} />;
}

function Card({ student, schoolName, schoolLogo }: CardLayoutProps) {
  return (
    <div className="sc-card">
      <div className="sc-top">
        <div className="sc-top-right">
          <div className="sc-school-name">{schoolName || "ProfManager"}</div>
          <div className="sc-fields">
            <div className="sc-row">
              <span className="sc-label">الإسم واللقب</span>
              <span className="sc-colon">:</span>
              <span className="sc-val">{student.fullName}</span>
            </div>
            <div className="sc-row">
              <span className="sc-label">المستوى</span>
              <span className="sc-colon">:</span>
              <span className="sc-val">{student.gradeLevel || "غير محدد"}</span>
            </div>
            <div className="sc-row">
              <span className="sc-label">هاتف المدرسة</span>
              <span className="sc-colon">:</span>
              <span className="sc-val">{student.schoolPhone || "غير محدد"}</span>
            </div>
          </div>
        </div>
        {schoolLogo && (
          <img src={schoolLogo} alt="شعار" className="sc-logo" />
        )}
      </div>
      <div className="sc-bottom">
        <StudentQrCode value={studentQrValue(student.id)} />
      </div>
    </div>
  );
}

export default Card;

export function StudentCardsPrintView({
  students,
  schoolName,
  schoolLogo,
}: {
  students: StudentCardData[];
  schoolName?: string | null;
  schoolLogo?: string | null;
}) {
  const pages: StudentCardData[][] = [];
  for (let i = 0; i < students.length; i += 6) {
    pages.push(students.slice(i, i + 6));
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{
        __html: `
          @page { size: A4; margin: 8mm; }
          @media print {
            html, body { margin: 0; padding: 0; background: #fff; }
          }
          .sc-print-root { }
          .sc-print-page {
            page-break-after: always;
            width: 190mm;
            height: 281mm;
            display: grid;
            grid-template-columns: repeat(2, 85mm);
            grid-template-rows: repeat(5, 55mm);
            gap: 1mm;
            justify-content: center;
            align-content: center;
            margin: 0 auto;
            box-sizing: border-box;
          }
          @media print {
            .sc-print-page {
              margin: 0;
            }
          }
          .sc-card {
            width: 85mm;
            height: 55mm;
            border: 1px solid #000;
            background: #fff;
            overflow: hidden;
            font-family: system-ui, sans-serif;
            direction: rtl;
            display: flex;
            flex-direction: column;
            box-sizing: border-box;
            padding: 2.5mm;
          }
          .sc-top {
            display: flex;
            gap: 2mm;
            flex: 1;
            min-height: 0;
          }
          .sc-logo {
            width: 18px;
            height: 18px;
            object-fit: contain;
            flex-shrink: 0;
            align-self: flex-start;
          }
          .sc-top-right {
            flex: 1;
            min-width: 0;
            display: flex;
            flex-direction: column;
            gap: 0.5mm;
          }
          .sc-school-name {
            font-size: 7px;
            font-weight: 700;
            color: #1e293b;
            word-break: break-word;
            line-height: 1.2;
          }
          .sc-fields {
            display: flex;
            flex-direction: column;
            gap: 0.3mm;
            flex: 1;
            justify-content: center;
          }
          .sc-row { display: flex; font-size: 6px; line-height: 1.2; }
          .sc-label {
            flex-shrink: 0;
            color: #64748b;
            font-weight: 600;
            margin-left: 1.5px;
          }
          .sc-colon {
            flex-shrink: 0;
            color: #99a1af;
            font-weight: 600;
            margin: 0 1px;
          }
          .sc-val {
            color: #1e293b;
            font-weight: 500;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }
          .sc-bottom {
            flex-shrink: 0;
            padding-top: 1mm;
            display: flex;
            justify-content: center;
          }
          .sc-bottom svg,
          .sc-bottom canvas,
          .sc-bottom div svg {
            width: auto;
            height: 100%;
            max-height: 14mm;
            display: block;
          }
        `
      }} />
      <div className="sc-print-root">
        {pages.map((page, pi) => (
          <div key={pi} className="sc-print-page">
            {page.map((s) => (
              <Card key={s.id} student={s} schoolName={schoolName} schoolLogo={schoolLogo} />
            ))}
          </div>
        ))}
      </div>
    </>
  );
}
