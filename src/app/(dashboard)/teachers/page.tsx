"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useT } from "@/lib/i18n";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Trash2, Pencil, X, BookOpenCheck, Wallet } from "lucide-react";
import { toast } from "sonner";

interface SubjectInfo {
  id: string;
  name: string;
  color: string;
}

interface Teacher {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
  salaryType: string;
  salaryAmount: number;
  salaryAmountTeacher?: number;
  subjects: SubjectInfo[];
}

interface TeachingLogEntry {
  id: string;
  sessionDate: string;
  startTime: string | null;
  endTime: string | null;
  status: string;
  type: string;
  groupName: string | null;
  subjectName: string | null;
  presentCount: number;
}

interface DuesSession {
  id: string;
  sessionDate: string;
  groupName: string | null;
  presentCount: number;
  institutionClients?: number;
  teacherClients?: number;
  earned: number;
  paidStatus?: "paid" | "partial" | "unpaid";
}

interface DuesData {
  teacher: Teacher;
  scope: string;
  perStudent: boolean;
  rate: number;
  monthlyMonths: number;
  sessions: DuesSession[];
  totals: { earned: number; paid: number; remaining: number; overpaid?: number };
}

const SALARY_TYPES = [
  "monthly", "per_student",
] as const;

function getSalaryAmountLabel(type: string): string {
  switch (type) {
    case "monthly":     return "الراتب الشهري (د.ج)";
    case "per_student": return "المبلغ لكل تلميذ (د.ج)";
    default:            return "المبلغ (د.ج)";
  }
}

function SubjectAutocomplete({
  allSubjects,
  selectedIds,
  onChange,
}: {
  allSubjects: SubjectInfo[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const t = useT();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const filtered = useMemo(() => {
    if (!query) return allSubjects.filter((s) => !selectedIds.includes(s.id));
    const q = query.toLowerCase();
    return allSubjects.filter(
      (s) => !selectedIds.includes(s.id) && s.name.toLowerCase().includes(q)
    );
  }, [allSubjects, selectedIds, query]);

  function addSubject(id: string) {
    onChange([...selectedIds, id]);
    setQuery("");
  }

  function removeSubject(id: string) {
    onChange(selectedIds.filter((sid) => sid !== id));
  }

  const selectedSubjects = allSubjects.filter((s) => selectedIds.includes(s.id));

  return (
    <div className="space-y-2" ref={ref}>
      <Label>{t("common.subject")}</Label>
      <div className="relative">
        <div className="flex min-h-9 w-full flex-wrap gap-1 rounded-md border border-input bg-background px-3 py-1 text-sm">
          {selectedSubjects.map((s) => (
            <span
              key={s.id}
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
              style={{ backgroundColor: `${s.color}22`, color: s.color }}
            >
              {s.name}
              <button type="button" onClick={() => removeSubject(s.id)} className="hover:opacity-70">
                <X className="size-3" />
              </button>
            </span>
          ))}
          <input
            type="text"
            className="min-w-[120px] flex-1 border-0 bg-transparent p-0 text-sm outline-none placeholder:text-muted-foreground"
            placeholder={selectedSubjects.length === 0 ? t("common.search") : ""}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
          />
        </div>
        {open && (
          <div className="absolute z-50 mt-1 max-h-48 w-full overflow-auto rounded-md border bg-popover shadow-md">
            {allSubjects.length === 0 ? (
              <p className="p-3 text-xs text-muted-foreground">{t("teachers.no_subjects")}</p>
            ) : filtered.length === 0 ? (
              <p className="p-3 text-xs text-muted-foreground">{t("common.noResults")}</p>
            ) : (
              filtered.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
                  onClick={() => addSubject(s.id)}
                >
                  <span className="inline-block size-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                  {s.name}
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function TeachersPage() {
  const t = useT();
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);

  async function fetchTeachers() {
    const res = await fetch("/api/teachers");
    if (res.ok) setTeachers(await res.json());
  }

  useEffect(() => {
    setLoading(true);
    fetchTeachers().finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold">{t("teachers.title")}</h1>
        <TeacherFormDialog onSaved={fetchTeachers} />
      </div>

      {loading ? (
        <p className="text-center text-muted-foreground">{t("common.loading")}</p>
      ) : teachers.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">{t("teachers.no_teachers")}</CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {teachers.map((teacher) => (
            <TeacherCard key={teacher.id} teacher={teacher} onUpdated={fetchTeachers} />
          ))}
        </div>
      )}
    </div>
  );
}

function TeacherCard({ teacher, onUpdated }: { teacher: Teacher; onUpdated: () => void }) {
  const t = useT();
  const [showPayDialog, setShowPayDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showLogDialog, setShowLogDialog] = useState(false);
  const [showDuesDialog, setShowDuesDialog] = useState(false);

  async function handleDelete() {
    if (!window.confirm(t("common.confirmDelete"))) return;
    try {
      const res = await fetch(`/api/teachers?id=${teacher.id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success(t("common.success"));
        onUpdated();
      } else {
        toast.error(t("common.error"));
      }
    } catch { toast.error(t("common.error")); }
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between pb-2">
          <div>
            <CardTitle className="text-base">{teacher.firstName} {teacher.lastName}</CardTitle>
            <p className="text-xs text-muted-foreground">{teacher.phone || teacher.email || "—"}</p>
          </div>
          <div className="flex gap-1">
            <Button variant="outline" size="icon" className="size-8" onClick={() => setShowEditDialog(true)} title={t("teachers.edit")}>
              <Pencil className="size-4" />
            </Button>
            <Button variant="outline" size="icon" className="size-8" onClick={() => setShowDuesDialog(true)} title={t("teachers.dues")}>
              <Wallet className="size-4" />
            </Button>
            <Button variant="outline" size="icon" className="size-8" onClick={() => setShowLogDialog(true)} title={t("teachers.teaching_log")}>
              <BookOpenCheck className="size-4" />
            </Button>
            <Button variant="outline" size="icon" className="size-8" onClick={handleDelete}>
              <Trash2 className="size-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">{salaryTypeLabel(teacher.salaryType)}</span>
            {teacher.salaryType === "per_student" ? (
              <span>
                <span className="block font-medium">{t("teachers.rate_institution_short")}: <span dir="ltr" className="inline-block">{teacher.salaryAmount ?? 0}%</span></span>
                <span className="block font-medium">{t("teachers.rate_teacher_short")}: <span dir="ltr" className="inline-block">{(teacher as any).salaryAmountTeacher ?? 0}%</span></span>
              </span>
            ) : (
              <span className="font-medium">{formatCurrency(teacher.salaryAmount)}</span>
            )}
          </div>
          {teacher.subjects && teacher.subjects.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {teacher.subjects.map((s) => (
                <span
                  key={s.id}
                  className="inline-block rounded-full px-2 py-0.5 text-xs font-medium"
                  style={{ backgroundColor: `${s.color}22`, color: s.color }}
                >
                  {s.name}
                </span>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      {showEditDialog && (
        <TeacherFormDialog
          teacher={teacher}
          onClose={() => setShowEditDialog(false)}
          onSaved={() => { setShowEditDialog(false); onUpdated(); }}
        />
      )}
      {showPayDialog && (
        <PayTeacherDialog teacher={teacher} onClose={() => setShowPayDialog(false)} onPaid={onUpdated} />
      )}
      {showDuesDialog && (
        <DuesDialog teacher={teacher} onClose={() => setShowDuesDialog(false)} onPaid={onUpdated} />
      )}
      {showLogDialog && (
        <TeachingLogDialog teacher={teacher} onClose={() => setShowLogDialog(false)} />
      )}
    </>
  );
}

function salaryTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    monthly: "Mensuel",
    fixed: "Fixe",
    per_student: "Par élève",
    per_hour: "Par heure",
    per_session: "Par séance",
    percentage: "Pourcentage",
  };
  return labels[type] || type;
}

function TeacherFormDialog({ teacher, onClose, onSaved }: {
  teacher?: Teacher | null;
  onClose?: () => void;
  onSaved: () => void;
}) {
  const t = useT();
  const isEditing = !!teacher;
  const [open, setOpen] = useState(false);
  const [name, setName] = useState([teacher?.firstName, teacher?.lastName].filter(Boolean).join(" ") || "");
  const [phone, setPhone] = useState(teacher?.phone || "");
  const [salaryType, setSalaryType] = useState(teacher?.salaryType || "monthly");
  const [salaryAmount, setSalaryAmount] = useState(String(teacher?.salaryAmount || ""));
  const [salaryAmountTeacher, setSalaryAmountTeacher] = useState(String((teacher as any)?.salaryAmountTeacher ?? ""));
  const [subjectIds, setSubjectIds] = useState<string[]>(teacher?.subjects?.map((s) => s.id) || []);
  const [allSubjects, setAllSubjects] = useState<SubjectInfo[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/subjects")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setAllSubjects(data);
      })
      .catch(() => {});
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      const payload = {
        fullName: name.trim(),
        phone: phone || undefined,
        salaryType,
        salaryAmount: Number(salaryAmount) || 0,
        salaryAmountTeacher: Number(salaryAmountTeacher) || 0,
        subjectIds,
      };
      const url = "/api/teachers";
      const res = await fetch(url, {
        method: isEditing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isEditing ? { id: teacher.id, ...payload } : payload),
      });
      if (res.ok) {
        toast.success(t("common.success"));
        setOpen(false);
        onSaved();
      } else {
        const err = await res.json();
        toast.error(err.error || t("common.error"));
      }
    } catch { toast.error(t("common.error")); }
    finally { setSaving(false); }
  }

  function handleOpenChange(open: boolean) {
    setOpen(open);
      if (!open) {
        if (!isEditing) {
          setName("");
          setPhone("");
          setSalaryType("monthly");
          setSalaryAmount("");
          setSalaryAmountTeacher("");
          setSubjectIds([]);
        }
      onClose?.();
    }
  }

  return (
    <Dialog open={isEditing ? true : open} onOpenChange={isEditing ? undefined : handleOpenChange}>
      {!isEditing && (
        <DialogTrigger asChild>
          <Button size="sm"><Plus className="size-4" /> {t("teachers.add")}</Button>
        </DialogTrigger>
      )}
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditing ? t("teachers.edit_title") : t("teachers.add")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>{t("teachers.fullName")}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <SubjectAutocomplete
            allSubjects={allSubjects}
            selectedIds={subjectIds}
            onChange={setSubjectIds}
          />
          <div className="space-y-2">
            <Label>{t("common.phone")}</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>{t("teachers.salary_type")}</Label>
            <select value={salaryType} onChange={(e) => setSalaryType(e.target.value)}
              className="w-full px-3 py-2 border border-input rounded-md bg-background text-sm">
              {SALARY_TYPES.map((st) => (
                <option key={st} value={st}>{t(`teachers.${st}`)}</option>
              ))}
            </select>
          </div>
          {salaryType === "per_student" ? (
            <div className="grid grid-cols-1 gap-3">
              <div className="space-y-2">
                <Label>{t("teachers.rate_institution_label")}</Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  value={salaryAmount}
                  onChange={(e) => setSalaryAmount(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("teachers.rate_teacher_label")}</Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  value={salaryAmountTeacher}
                  onChange={(e) => setSalaryAmountTeacher(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">{t("teachers.rate_hint")}</p>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <Label>{getSalaryAmountLabel(salaryType)}</Label>
              <Input
                type="number"
                min="0"
                step="100"
                value={salaryAmount}
                onChange={(e) => setSalaryAmount(e.target.value)}
              />
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => { if (isEditing) onClose?.(); else setOpen(false); }}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={saving}>{saving ? t("common.saving") : t("common.save")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PayTeacherDialog({ teacher, onClose, onPaid }: { teacher: Teacher; onClose: () => void; onPaid: () => void }) {
  const t = useT();
  const [amount, setAmount] = useState(String(teacher.salaryAmount));
  const [periodMonth, setPeriodMonth] = useState(new Date().toISOString().slice(0, 7));
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!amount || Number(amount) <= 0) return;
    setSaving(true);
    try {
      const res = await fetch("/api/teachers/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teacherId: teacher.id,
          periodMonth: periodMonth + "-01",
          amount: Number(amount),
          notes: notes || undefined,
        }),
      });
      if (res.ok) {
        toast.success(t("common.success"));
        onClose();
        onPaid();
      } else {
        const err = await res.json();
        toast.error(err.error || t("common.error"));
      }
    } catch { toast.error(t("common.error")); }
    finally { setSaving(false); }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t("teachers.pay")} — {teacher.firstName} {teacher.lastName}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>{t("teachers.period")}</Label>
            <Input type="month" value={periodMonth} onChange={(e) => setPeriodMonth(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label>{t("payments.amount")}</Label>
            <Input type="number" min="0" step="1000" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label>{t("common.notes")}</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
            <Button type="submit" disabled={saving}>{saving ? t("common.saving") : t("common.save")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function getSessionTypeLabel(type: string | null, t: (key: string) => string): string {
  if (type === "extra") return t("groups.extra_session");
  if (type === "makeup") return t("groups.makeup_session");
  return t("groups.regular_session");
}

function TeachingLogDialog({ teacher, onClose }: { teacher: Teacher; onClose: () => void }) {
  const t = useT();
  const [entries, setEntries] = useState<TeachingLogEntry[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/teachers/${teacher.id}/teaching-log`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setEntries(Array.isArray(data) ? data : data?.sessions || []);
      })
      .catch(() => {
        if (!cancelled) setEntries([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [teacher.id]);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("teachers.teaching_log")} — {teacher.firstName} {teacher.lastName}</DialogTitle>
        </DialogHeader>

        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{t("teachers.taught_sessions")}</span>
          <span className="font-medium">{entries ? entries.length : "—"}</span>
        </div>

        <div className="max-h-96 space-y-2 overflow-y-auto">
          {loading ? (
            <p className="p-6 text-center text-sm text-muted-foreground">{t("common.loading")}</p>
          ) : !entries || entries.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">{t("teachers.no_taught_sessions")}</p>
          ) : (
            entries.map((s) => (
              <Card key={s.id}>
                <CardContent className="flex flex-col gap-1 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{s.groupName || "—"}</span>
                    <span className="text-xs text-muted-foreground">{formatDate(s.sessionDate)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
                    <span>{s.subjectName || "—"}</span>
                    <span>{s.startTime ?? ""}{s.endTime ? ` — ${s.endTime}` : ""}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex w-fit items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                      <BookOpenCheck className="size-3.5" />
                      {t("teachers.students_present", { count: s.presentCount ?? 0 })}
                    </span>
                    {s.type && s.type !== "regular" && (
                      <span className="inline-flex w-fit rounded-full bg-accent px-2 py-0.5 text-xs">
                        {getSessionTypeLabel(s.type, t)}
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
            </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DuesDialog({ teacher, onClose, onPaid }: { teacher: Teacher; onClose: () => void; onPaid: () => void }) {
  const t = useT();
  const [month, setMonth] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [data, setData] = useState<DuesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const q = month ? `?month=${month}` : "";
    fetch(`/api/teachers/${teacher.id}/dues${q}`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [teacher.id, month, refresh]);

  async function handlePayRemaining() {
    if (!data || data.totals.remaining <= 0) return;
    setPaying(true);
    try {
      const res = await fetch("/api/teachers/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teacherId: teacher.id,
          periodMonth: (month || new Date().toISOString().slice(0, 7)) + "-01",
          amount: data.totals.remaining,
          notes: t("teachers.dues") || undefined,
        }),
      });
      if (res.ok) {
        toast.success(t("common.success"));
        onPaid();
        setRefresh((r) => r + 1);
      } else {
        const err = await res.json();
        toast.error(err.error || t("common.error"));
      }
    } catch { toast.error(t("common.error")); }
    finally { setPaying(false); }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("teachers.dues")} — {teacher.firstName} {teacher.lastName}</DialogTitle>
        </DialogHeader>

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <label className="text-sm text-muted-foreground">{t("teachers.period")}</label>
            <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-44" />
          </div>
          {month && (
            <Button variant="ghost" size="sm" onClick={() => setMonth("")}>{t("teachers.all_period")}</Button>
          )}
        </div>

        {loading ? (
          <p className="p-6 text-center text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : !data ? (
          <p className="p-6 text-center text-sm text-muted-foreground">{t("common.error")}</p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2 text-center">
              <TotalsBox label={t("teachers.total_due")} value={data.totals.earned} />
              <TotalsBox label={t("teachers.total_paid")} value={data.totals.paid} />
              <TotalsBox label={t("teachers.remaining")} value={data.totals.remaining} warn={data.totals.remaining > 0} />
            </div>

            {!data.perStudent && data.monthlyMonths > 0 && (
              <p className="text-sm text-muted-foreground">
                {t("teachers.monthly_note", { months: data.monthlyMonths })}
              </p>
            )}

            <div className="max-h-72 space-y-2 overflow-y-auto">
              {data.sessions.length === 0 ? (
                <p className="p-4 text-center text-sm text-muted-foreground">{t("teachers.no_dues_sessions")}</p>
              ) : (
                data.sessions.map((s) => {
                  const paidCls =
                    s.paidStatus === "paid"
                      ? "border-green-500/50 bg-green-500/5"
                      : s.paidStatus === "partial"
                        ? "border-amber-500/50 bg-amber-500/5"
                        : "";
                  const earnedCls =
                    s.paidStatus === "paid"
                      ? "text-green-600 font-semibold"
                      : s.paidStatus === "partial"
                        ? "text-amber-600 font-semibold"
                        : "font-medium";
                  return (
                  <Card key={s.id} className={paidCls}>
                    <CardContent className="flex items-center justify-between gap-2 py-2.5">
                      <div>
                        <p className="text-sm font-medium">{s.groupName || "—"}</p>
                        <p className="text-xs text-muted-foreground">{formatDate(s.sessionDate)}</p>
                      </div>
                      <div className="flex items-center gap-3 text-sm">
                        {data.perStudent ? (
                          <span className="flex flex-col items-end leading-tight">
                            <span className="text-xs text-muted-foreground">{t("teachers.rate_institution_short")}: <span className="font-medium text-foreground">{s.institutionClients ?? 0}</span></span>
                            <span className="text-xs text-muted-foreground">{t("teachers.rate_teacher_short")}: <span className="font-medium text-foreground">{s.teacherClients ?? 0}</span></span>
                          </span>
                        ) : (
                          <span className="text-muted-foreground">{t("teachers.students_present", { count: s.presentCount })}</span>
                        )}
                        {data.perStudent && <span className={earnedCls}>{formatCurrency(s.earned)}</span>}
                       </div>
                     </CardContent>
                   </Card>
                   );
                 })
               )}
             </div>

            {(data.totals.overpaid ?? 0) > 0 && (
              <div className="rounded-lg bg-sky-500/10 px-3 py-2 text-sm">
                {t("teachers.overpaid_hint", { amount: formatCurrency(data.totals.overpaid ?? 0) })}
              </div>
            )}

            {data.totals.remaining > 0 && (
              <div className="rounded-lg bg-amber-500/10 px-3 py-2 text-sm">
                {t("teachers.dues_hint", { amount: formatCurrency(data.totals.remaining) })}
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
              {data.totals.remaining > 0 && (
                <Button onClick={handlePayRemaining} disabled={paying}>
                  {paying ? t("common.saving") : t("teachers.pay_remaining", { amount: formatCurrency(data.totals.remaining) })}
                </Button>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function TotalsBox({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 ${warn ? "border-amber-300 bg-amber-500/10" : ""}`}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-bold">{formatCurrency(value)}</p>
    </div>
  );
}
