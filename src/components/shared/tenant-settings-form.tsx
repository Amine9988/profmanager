"use client";

import { useRef, useState, useTransition } from "react";
import { updateTenantSettings } from "@/server/actions/settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { Save, Trash2 } from "@/lib/lucide";

type Tenant = {
  name: string;
  schoolPhone?: string;
  schoolEmail?: string | null;
  smtpPassword?: string | null;
  schoolLogo?: string | null;
};

function readImageAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function resizeImage(dataUrl: string, maxSize = 256): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      const scale = Math.min(maxSize / width, maxSize / height, 1);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return resolve(dataUrl);
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

export function TenantSettingsForm({ tenant }: { tenant: Tenant }) {
  const t = useT();
  const [isPending, startTransition] = useTransition();
  const [logoPreview, setLogoPreview] = useState<string | null>(tenant.schoolLogo ?? null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    readImageAsDataUrl(file)
      .then((dataUrl) => resizeImage(dataUrl))
      .then((resized) => {
        setLogoPreview(resized);
      })
      .catch(() => toast.error(t("common.error")));
  }

  function handleRemoveLogo() {
    setLogoPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    if (logoPreview) {
      formData.set("schoolLogo", logoPreview);
    } else if (!tenant.schoolLogo) {
      formData.set("schoolLogo", "");
    }
    startTransition(async () => {
      const res = await updateTenantSettings(formData);
      if (res.success) {
        toast.success(t("settings.saved"));
      } else {
        toast.error(res.error ?? t("common.error"));
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">{t("settings.schoolName")}</Label>
        <Input id="name" name="name" defaultValue={tenant.name} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="schoolPhone">{t("settings.schoolPhone")}</Label>
        <Input id="schoolPhone" name="schoolPhone" defaultValue={tenant.schoolPhone} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="schoolEmail">{t("settings.schoolEmail")}</Label>
        <Input
          id="schoolEmail"
          name="schoolEmail"
          type="email"
          inputMode="email"
          autoComplete="email"
          dir="ltr"
          placeholder={t("students.form.emailPlaceholder")}
          defaultValue={tenant.schoolEmail ?? ""}
        />
      </div>
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label htmlFor="smtpPassword">{t("settings.smtpPassword")}</Label>
          <a
            href="https://myaccount.google.com/apppasswords"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-medium text-primary underline-offset-2 hover:underline"
          >
            {t("settings.smtpPasswordLink")}
          </a>
        </div>
        <Input
          id="smtpPassword"
          name="smtpPassword"
          type="password"
          autoComplete="new-password"
          dir="ltr"
          defaultValue={tenant.smtpPassword ?? ""}
        />
        <p className="text-xs text-muted-foreground">{t("settings.smtpHint")}</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="schoolLogoFile">{t("settings.schoolLogo")}</Label>
        <input
          ref={fileInputRef}
          id="schoolLogoFile"
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="hidden"
        />
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent"
          >
            اختيار صورة
          </button>
          {logoPreview && (
            <button
              type="button"
              onClick={handleRemoveLogo}
              className="rounded-md border border-input p-1.5 text-muted-foreground hover:text-destructive"
              title="إزالة الشعار"
            >
              <Trash2 className="size-4" />
            </button>
          )}
        </div>
        {logoPreview ? (
          <div className="mt-2 flex items-center gap-2">
            <img src={logoPreview} alt="شعار" className="size-12 rounded object-cover border" />
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">اختر صورة الشعار (PNG/JPG). ستُحفظ مضغوطة.</p>
        )}
      </div>
      <Button type="submit" disabled={isPending}>
        <Save className="size-4 mr-1" />{isPending ? t("common.saving") : t("common.save")}
      </Button>
    </form>
  );
}
