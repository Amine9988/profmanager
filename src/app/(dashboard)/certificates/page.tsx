"use client";

import { useState, useEffect, useRef } from "react";
import { useT } from "@/lib/i18n";
import { formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardAction } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { ScrollText, Plus, Trash2, Settings2, FileText, Upload, RotateCcw, Pencil, Download, X, Printer, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Certificate {
  id: string;
  studentId: string;
  studentName: string;
  type: string;
  title: string;
  template?: string;
  description: string | null;
  issueDate: string;
  createdAt: string;
}

interface Student {
  id: string;
  fullName: string;
}

export default function CertificatesPage() {
  const t = useT();
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // PDF viewer
  const [pdfViewerUrl, setPdfViewerUrl] = useState<string | null>(null);
  const pdfViewerUrlRef = useRef<string | null>(null);
  const [pdfName, setPdfName] = useState("");
  const [printingId, setPrintingId] = useState<string | null>(null);
  const [bulkPrinting, setBulkPrinting] = useState(false);

  // Generate dialog
  const [showGenerate, setShowGenerate] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState("");
  const [selectedLang, setSelectedLang] = useState("fr");
  const [certDesc, setCertDesc] = useState("");
  const [saving, setSaving] = useState(false);

  // Edit dialog
  const [showEdit, setShowEdit] = useState(false);
  const [editCert, setEditCert] = useState<Certificate | null>(null);
  const [editStudent, setEditStudent] = useState("");
  const [editDesc, setEditDesc] = useState("");

  // Settings
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState({
    directorName: "", coachName: "", coachTitle: "", schoolName: "", referencePrefix: "DSK-",
  });
  const [templateExists, setTemplateExists] = useState(false);
  const [logoExists, setLogoExists] = useState(false);
  const [uploadingTemplate, setUploadingTemplate] = useState(false);

  async function load() {
    try {
      const [certRes, studRes] = await Promise.all([
        fetch("/api/certificates"),
        fetch("/api/students?status=active"),
      ]);
      if (certRes.ok) setCertificates(await certRes.json());
      if (studRes.ok) setStudents(await studRes.json());
    } catch {}
    setLoading(false);
  }

  useEffect(() => { load(); }, []);
  useEffect(() => { if (showSettings) loadSettings(); }, [showSettings]);

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === certificates.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(certificates.map((c) => c.id)));
    }
  }

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedStudent) {
      toast.error(t("common.required"));
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/certificates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: selectedStudent,
          type: "enrollment",
          title: "شهادة",
          template: selectedLang,
          description: certDesc.trim() || null,
        }),
      });
      if (res.ok) {
        toast.success(t("common.success"));
        setShowGenerate(false);
        setSelectedStudent("");
        setSelectedLang("fr");
        setCertDesc("");
        load();
      } else {
        const err = await res.json();
        toast.error(err.error || t("common.error"));
      }
    } catch { toast.error(t("common.error")); }
    finally { setSaving(false); }
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editCert || !editStudent) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/certificates?id=${editCert.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: editStudent,
          description: editDesc.trim() || null,
        }),
      });
      if (res.ok) {
        toast.success(t("common.success"));
        setShowEdit(false);
        setEditCert(null);
        load();
      } else {
        const err = await res.json();
        toast.error(err.error || t("common.error"));
      }
    } catch { toast.error(t("common.error")); }
    finally { setSaving(false); }
  }

  function openEdit(c: Certificate) {
    setEditCert(c);
    setEditStudent(c.studentId);
    setEditDesc(c.description || "");
    setShowEdit(true);
  }

  async function loadSettings() {
    try {
      const [sRes, tRes] = await Promise.all([
        fetch("/api/certificates/settings"),
        fetch("/api/certificates/template"),
      ]);
      if (sRes.ok) {
        const data = await sRes.json();
        setSettings(data);
      }
      if (tRes.ok) {
        const data = await tRes.json();
        setTemplateExists(data.exists);
        setLogoExists(data.logoExists);
      }
    } catch {}
  }

  async function saveSettings() {
    try {
      const res = await fetch("/api/certificates/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (res.ok) {
        toast.success(t("common.success"));
        setShowSettings(false);
      } else {
        toast.error(t("common.error"));
      }
    } catch { toast.error(t("common.error")); }
  }

  async function handleUploadTemplate(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith(".docx")) { toast.error(t("certificates.template_invalid")); return; }
    setUploadingTemplate(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/certificates/template", { method: "POST", body: fd });
      if (res.ok) { toast.success(t("common.success")); setTemplateExists(true); }
      else { toast.error(t("common.error")); }
    } catch { toast.error(t("common.error")); }
    finally { setUploadingTemplate(false); e.target.value = ""; }
  }

  async function handleUploadLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error(t("certificates.logo_invalid")); return; }
    try {
      const fd = new FormData();
      fd.append("logo", file);
      const res = await fetch("/api/certificates/template", { method: "POST", body: fd });
      if (res.ok) { toast.success(t("common.success")); setLogoExists(true); }
      else { toast.error(t("common.error")); }
    } catch { toast.error(t("common.error")); }
    finally { e.target.value = ""; }
  }

  async function handleDeleteLogo() {
    try {
      const res = await fetch("/api/certificates/template?target=logo", { method: "DELETE" });
      if (res.ok) { toast.success(t("common.success")); setLogoExists(false); }
      else { toast.error(t("common.error")); }
    } catch { toast.error(t("common.error")); }
  }

  async function handleDeleteTemplate() {
    try {
      const res = await fetch("/api/certificates/template?target=template", { method: "DELETE" });
      if (res.ok) { toast.success(t("common.success")); setTemplateExists(false); }
      else { toast.error(t("common.error")); }
    } catch { toast.error(t("common.error")); }
  }

  async function handleDelete(id: string) {
    if (!window.confirm(t("common.confirmDelete"))) return;
    try {
      const res = await fetch(`/api/certificates?id=${id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success(t("common.success"));
        load();
      } else {
        toast.error(t("common.error"));
      }
    } catch { toast.error(t("common.error")); }
  }

  async function handleBulkDelete() {
    if (selectedIds.size === 0) return;
    if (!window.confirm(t("common.confirmDelete"))) return;
    try {
      const res = await fetch("/api/certificates/bulk-delete", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });
      if (res.ok) {
        toast.success(t("common.success"));
        setSelectedIds(new Set());
        load();
      } else {
        toast.error(t("common.error"));
      }
    } catch { toast.error(t("common.error")); }
  }

  function handleBulkDownload() {
    for (const id of selectedIds) {
      const a = document.createElement("a");
      a.href = `/api/certificates/${id}/docx`;
      a.download = "";
      a.click();
    }
  }

  async function handleBulkPrint() {
    if (selectedIds.size === 0 || bulkPrinting) return;
    setBulkPrinting(true);
    try {
      const res = await fetch("/api/certificates/bulk-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        toast.error(err?.error || t("common.error"));
        return;
      }
      const blob = await res.blob();
      if (pdfViewerUrlRef.current) URL.revokeObjectURL(pdfViewerUrlRef.current);
      const url = URL.createObjectURL(blob);
      pdfViewerUrlRef.current = url;
      setPdfName(`attestations_${selectedIds.size}.pdf`);
      setPdfViewerUrl(url);
    } catch (err) {
      console.error("Bulk PDF error:", err);
      toast.error(t("common.error"));
    } finally {
      setBulkPrinting(false);
    }
  }

  function handleDownloadWord(id: string) {
    const a = document.createElement("a");
    a.href = `/api/certificates/${id}/docx`;
    a.download = "";
    a.click();
  }

  async function handlePrint(c: Certificate) {
    if (printingId) return;
    setPrintingId(c.id);
    try {
      const res = await fetch(`/api/certificates/${c.id}/pdf`);
      if (!res.ok) { toast.error(t("common.error")); return; }
      const blob = await res.blob();
      if (pdfViewerUrlRef.current) URL.revokeObjectURL(pdfViewerUrlRef.current);
      const url = URL.createObjectURL(blob);
      pdfViewerUrlRef.current = url;
      setPdfName(`${c.studentName}-${c.type}.pdf`);
      setPdfViewerUrl(url);
    } catch (err) {
      console.error("PDF error:", err);
      toast.error(t("common.error"));
    } finally {
      setPrintingId(null);
    }
  }

  return (
    <div className="space-y-6 p-6 animate-slide-up">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-lg bg-primary/8">
            <ScrollText className="size-[18px] text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">{t("certificates.title")}</h1>
            <p className="text-xs text-muted-foreground mt-0.5">{certificates.length} {t("certificates.total")}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Dialog open={showSettings} onOpenChange={setShowSettings}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm"><Settings2 className="size-3.5" /></Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>{t("certificates.settings")}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>{t("certificates.director_name")}</Label>
                  <Input value={settings.directorName} onChange={(e) => setSettings({...settings, directorName: e.target.value})} />
                </div>
                <div className="space-y-2">
                  <Label>{t("certificates.coach_name")}</Label>
                  <Input value={settings.coachName} onChange={(e) => setSettings({...settings, coachName: e.target.value})} />
                </div>
                <div className="space-y-2">
                  <Label>{t("certificates.school_name")}</Label>
                  <Input value={settings.schoolName} onChange={(e) => setSettings({...settings, schoolName: e.target.value})} />
                </div>
                <div className="space-y-2">
                  <Label>{t("certificates.reference_prefix")}</Label>
                  <Input value={settings.referencePrefix} onChange={(e) => setSettings({...settings, referencePrefix: e.target.value})} />
                </div>
                <hr className="border-border" />
                <div className="space-y-2">
                  <Label>{t("certificates.template_file")}</Label>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" className="relative" disabled={uploadingTemplate}>
                      <Upload className="size-3.5" />
                      <span className="ml-1">{uploadingTemplate ? t("common.loading") : t("certificates.upload_template")}</span>
                      <input type="file" accept=".docx" className="absolute inset-0 opacity-0 cursor-pointer" onChange={handleUploadTemplate} />
                    </Button>
                    {templateExists && (
                      <Button variant="ghost" size="sm" onClick={handleDeleteTemplate}>
                        <RotateCcw className="size-3.5 text-destructive" />
                      </Button>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{templateExists ? t("certificates.template_active") : t("certificates.template_none")}</p>
                </div>
                <hr className="border-border" />
                <div className="space-y-2">
                  <Label>{t("certificates.logo_image")}</Label>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" className="relative">
                      <Upload className="size-3.5" />
                      <span className="ml-1">{t("certificates.upload_logo")}</span>
                      <input type="file" accept="image/*" className="absolute inset-0 opacity-0 cursor-pointer" onChange={handleUploadLogo} />
                    </Button>
                    {logoExists && (
                      <Button variant="ghost" size="sm" onClick={handleDeleteLogo}>
                        <RotateCcw className="size-3.5 text-destructive" />
                      </Button>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{logoExists ? t("certificates.logo_active") : t("certificates.logo_none")}</p>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowSettings(false)}>{t("common.cancel")}</Button>
                <Button onClick={saveSettings}>{t("common.save")}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Dialog open={showGenerate} onOpenChange={setShowGenerate}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="size-3.5" /> {t("certificates.generate")}</Button>
            </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("certificates.generate")}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleGenerate} className="space-y-4">
              <div className="space-y-2">
                <Label>{t("certificates.student")}</Label>
                <select
                  value={selectedStudent}
                  onChange={(e) => setSelectedStudent(e.target.value)}
                  className="w-full px-3 py-2 border border-input rounded-md bg-background text-sm"
                  required
                >
                  <option value="">{t("certificates.select_student")}</option>
                  {students.map((s) => (
                    <option key={s.id} value={s.id}>{s.fullName}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>{t("certificates.language")}</Label>
                <select
                  value={selectedLang}
                  onChange={(e) => setSelectedLang(e.target.value)}
                  className="w-full px-3 py-2 border border-input rounded-md bg-background text-sm"
                >
                  <option value="fr">Français</option>
                  <option value="ar">العربية</option>
                  <option value="en">English</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>{t("certificates.description")}</Label>
                <textarea
                  value={certDesc}
                  onChange={(e) => setCertDesc(e.target.value)}
                  className="w-full px-3 py-2 border border-input rounded-md bg-background text-sm resize-none"
                  rows={3}
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setShowGenerate(false)}>
                  {t("common.cancel")}
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? t("common.saving") : t("common.save")}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
      </div>

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 bg-destructive/5 border border-destructive/15 rounded-lg animate-fade-in">
          <span className="text-sm font-medium text-destructive">
            {selectedIds.size} {t("common.selected")}
          </span>
          <Button size="sm" variant="destructive" onClick={handleBulkDelete}>
            <Trash2 className="size-3.5" /> {t("common.delete")}
          </Button>
          <Button size="sm" variant="outline" onClick={handleBulkDownload}>
            <Download className="size-3.5" /> {t("certificates.download_docx")}
          </Button>
          <Button size="sm" variant="outline" onClick={handleBulkPrint} disabled={bulkPrinting}>
            {bulkPrinting ? <Loader2 className="size-3.5 animate-spin" /> : <Printer className="size-3.5" />} {t("common.print")}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>
            <X className="size-3.5" />
          </Button>
        </div>
      )}

      {loading ? (
        <div className="text-center text-sm text-muted-foreground py-8">{t("common.loading")}</div>
      ) : certificates.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <ScrollText className="size-8 text-muted-foreground/20" />
            <p className="font-medium">{t("certificates.empty")}</p>
            <p className="text-sm text-muted-foreground">{t("certificates.empty_desc")}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {/* Select all header */}
          <div className="flex items-center gap-3 px-1 py-1">
            <input
              type="checkbox"
              checked={certificates.length > 0 && selectedIds.size === certificates.length}
              onChange={toggleSelectAll}
              className="size-4 rounded border-border text-primary focus:ring-primary/30 cursor-pointer"
            />
            <span className="text-xs text-muted-foreground">{t("common.select_all")}</span>
          </div>
          {certificates.map((c) => (
<Card key={c.id} className="hover:shadow-[0_2px_8px_0_rgba(0,0,0,0.06)] transition-shadow">
              <CardContent className="flex items-center justify-between py-3.5">
                <div className="flex items-center gap-3 min-w-0">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(c.id)}
                    onChange={() => toggleSelect(c.id)}
                    className="size-4 rounded border-border text-primary focus:ring-primary/30 cursor-pointer shrink-0"
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{c.title} {c.studentName}</p>
                    <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                      <span>{formatDate(c.issueDate)}</span>
                      <span className="inline-flex items-center rounded border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
                        {c.template === "ar" ? "AR" : c.template === "en" ? "EN" : "FR"}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(c)} title={t("common.edit")}>
                    <Pencil className="size-3.5 text-muted-foreground/60" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => handlePrint(c)} title={t("common.print")} disabled={printingId !== null}>
                    {printingId === c.id ? <Loader2 className="size-3.5 animate-spin text-muted-foreground/60" /> : <Printer className="size-3.5 text-muted-foreground/60" />}
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => handleDownloadWord(c.id)} title={t("certificates.download_docx")}>
                    <FileText className="size-3.5 text-muted-foreground/60" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(c.id)} title={t("common.delete")}>
                    <Trash2 className="size-3.5 text-destructive/60" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Edit dialog */}
      <Dialog open={showEdit} onOpenChange={(open) => { if (!open) { setShowEdit(false); setEditCert(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("common.edit")}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveEdit} className="space-y-4">
            <div className="space-y-2">
              <Label>{t("certificates.student")}</Label>
              <select
                value={editStudent}
                onChange={(e) => setEditStudent(e.target.value)}
                className="w-full px-3 py-2 border border-input rounded-md bg-background text-sm"
                required
              >
                <option value="">{t("certificates.select_student")}</option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>{s.fullName}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>{t("certificates.description")}</Label>
              <textarea
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                className="w-full px-3 py-2 border border-input rounded-md bg-background text-sm resize-none"
                rows={3}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { setShowEdit(false); setEditCert(null); }}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? t("common.saving") : t("common.save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* PDF viewer dialog */}
      <Dialog open={!!pdfViewerUrl} onOpenChange={(o) => { if (!o) { setPdfViewerUrl(null); if (pdfViewerUrlRef.current) { URL.revokeObjectURL(pdfViewerUrlRef.current); pdfViewerUrlRef.current = null; } } }}>
        <DialogContent className="max-w-4xl h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{t("certificates.title")}</DialogTitle>
          </DialogHeader>
          {pdfViewerUrl && (
            <iframe src={pdfViewerUrl} className="w-full flex-1 min-h-0 border-0 rounded" style={{ height: "calc(90vh - 120px)" }} />
          )}
          <DialogFooter className="shrink-0">
            <Button variant="outline" onClick={() => { const a = document.createElement("a"); a.href = pdfViewerUrl!; a.download = pdfName || "certificat.pdf"; a.click(); }}>
              <Download className="size-4 ml-1" /> {t("certificates.download_pdf")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
