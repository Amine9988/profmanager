"use client";

import { useState, useTransition, useEffect } from "react";
import { createSubject } from "@/server/actions/groups";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n";
import { formatCurrency } from "@/lib/utils";
import { Plus, Tag } from "@/lib/lucide";

type Subject = { id: string; name: string; color: string };

interface SubjectPricing {
  id: string;
  subjectId: string;
  level: string;
  monthlyPrice: number;
  sessionPrice: number;
  subjects?: { name: string; color: string };
}

export function SubjectManager({ subjects }: { subjects: Subject[] }) {
  const t = useT();
  const [name, setName] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const [pricing, setPricing] = useState<SubjectPricing[]>([]);
  const [selectedSubject, setSelectedSubject] = useState<string>("");
  const [selectedLevel, setSelectedLevel] = useState<string>("");
  const [monthlyPrice, setMonthlyPrice] = useState("");
  const [sessionPrice, setSessionPrice] = useState("");
  const [savingPricing, setSavingPricing] = useState(false);
  const [availableLevels, setAvailableLevels] = useState<{ nameAr: string; cycle: string }[]>([]);

  async function fetchPricing() {
    const res = await fetch("/api/subject-pricing");
    if (res.ok) setPricing(await res.json());
  }

  async function fetchLevels() {
    const res = await fetch("/api/levels");
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        setAvailableLevels(data.filter((l: any) => l.status !== "archived").map((l: any) => ({ nameAr: l.nameAr, cycle: l.cycle })));
      }
    }
  }

  useEffect(() => { fetchPricing(); fetchLevels(); }, []);

  function handleAdd() {
    if (!name.trim()) return;
    startTransition(async () => {
      const res = await createSubject(name.trim());
      if (res.success) {
        toast.success(t("settings.subject_added"));
        setName("");
        router.refresh();
      } else {
        toast.error(res.error ?? t("common.error"));
      }
    });
  }

  async function handleSavePricing() {
    if (!selectedSubject || !selectedLevel) return;
    setSavingPricing(true);
    try {
      const res = await fetch("/api/subject-pricing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subjectId: selectedSubject,
          level: selectedLevel,
          monthlyPrice: Number(monthlyPrice) || 0,
          sessionPrice: Number(sessionPrice) || 0,
        }),
      });
      if (res.ok) {
        toast.success(t("common.success"));
        setMonthlyPrice("");
        setSessionPrice("");
        fetchPricing();
      } else {
        const err = await res.json();
        toast.error(err.error || t("common.error"));
      }
    } catch {
      toast.error(t("common.error"));
    } finally {
      setSavingPricing(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {subjects.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("settings.no_subjects")}</p>
        ) : (
          subjects.map((s) => (
            <Badge key={s.id} style={{ backgroundColor: `${s.color}18`, color: s.color }} variant="outline" className="border-0 font-medium">
              <Tag className="size-3 mr-1" />{s.name}
            </Badge>
          ))
        )}
      </div>
      <div className="flex gap-2">
        <Input
          placeholder={t("settings.subject_placeholder")}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
        />
        <Button onClick={handleAdd} disabled={isPending}>
          <Plus className="size-4 mr-1" />{t("common.add")}
        </Button>
      </div>

      <div className="border-t pt-4">
        <h4 className="text-sm font-medium mb-3">{t("settings.subject_pricing")}</h4>
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 items-end">
          <div className="space-y-1.5">
            <Label className="text-xs">{t("common.subject")}</Label>
            <Select value={selectedSubject} onValueChange={setSelectedSubject}>
              <SelectTrigger>
                <SelectValue placeholder={t("common.select")} />
              </SelectTrigger>
              <SelectContent>
                {subjects.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t("common.level")}</Label>
            <select
              value={selectedLevel}
              onChange={(e) => setSelectedLevel(e.target.value)}
              className="flex h-9 w-full min-w-0 rounded-lg border border-input bg-background px-3 py-1 text-sm shadow-sm transition-all duration-200 focus-visible:border-ring focus-visible:ring-ring/40 focus-visible:ring-[3px] focus-visible:shadow-md outline-none"
            >
              <option value="">{t("common.select")}</option>
              {availableLevels.map((l) => (
                <option key={l.nameAr} value={l.nameAr}>{l.nameAr}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t("groups.monthly")}</Label>
            <Input type="number" min="0" step="500" value={monthlyPrice} onChange={(e) => setMonthlyPrice(e.target.value)} placeholder="0" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t("groups.per_session")}</Label>
            <Input type="number" min="0" step="500" value={sessionPrice} onChange={(e) => setSessionPrice(e.target.value)} placeholder="0" />
          </div>
          <Button onClick={handleSavePricing} disabled={savingPricing || !selectedSubject || !selectedLevel} size="sm">
            {t("common.save")}
          </Button>
        </div>
      </div>

      {pricing.length > 0 && (
        <div className="border-t pt-4">
          <h4 className="text-sm font-medium mb-3">{t("settings.current_pricing")}</h4>
          <div className="space-y-2">
            {pricing.map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded-lg border p-3 text-sm hover:bg-accent/30 transition-colors">
                <span className="font-medium">{p.subjects?.name || "?"}</span>
                <span className="text-muted-foreground">{p.level}</span>
                <span className="tabular-nums">{formatCurrency(p.monthlyPrice)}/mois</span>
                <span className="tabular-nums">{formatCurrency(p.sessionPrice)}/séance</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
