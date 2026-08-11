"use client";

import { useState } from "react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LanguageSwitcher } from "@/components/shared/language-switcher";
import { useT, useI18n } from "@/lib/i18n";
import { signIn, signUp } from "@/server/actions/auth";
import { GraduationCap, AlertCircle, Sparkles } from "lucide-react";

type AuthState = { error?: string };

export default function LoginPage() {
  const t = useT();
  const { locale } = useI18n();
  const [mode, setMode] = useState<"login" | "signup">("login");

  const action = mode === "login" ? signIn : signUp;
  const wrapped = async (_prev: AuthState, formData: FormData): Promise<AuthState> => {
    return await action(formData);
  };
  const [state, formAction, pending] = useActionState<AuthState, FormData>(wrapped, {});

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-slate-50 via-background to-indigo-50/60 dark:from-slate-950 dark:via-background dark:to-indigo-950/30">
      <header className="flex h-14 items-center justify-between px-4 md:px-8">
        <div className="flex items-center gap-2 font-bold tracking-tight">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <GraduationCap className="size-4" />
          </span>
          <span className="text-lg">ProfManager</span>
        </div>
        <LanguageSwitcher />
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-10">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <GraduationCap className="size-6" />
            </div>
            <CardTitle className="mt-2 text-2xl">
              {mode === "login" ? t("auth.login_title") : t("auth.signup_title")}
            </CardTitle>
            <CardDescription>
              {mode === "login" ? t("auth.login_desc") : t("auth.signup_desc")}
            </CardDescription>
          </CardHeader>

          <form action={formAction}>
            <CardContent className="space-y-4">
              {state?.error && (
                <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
                  <AlertCircle className="mt-0.5 size-4 shrink-0" />
                  <span>{state.error}</span>
                </div>
              )}

              {mode === "signup" && (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="fullName">{t("auth.full_name_label")}</Label>
                    <Input id="fullName" name="fullName" required placeholder={t("auth.full_name_placeholder")} autoComplete="name" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="tenantName">{t("auth.activity_label")}</Label>
                    <Input id="tenantName" name="tenantName" required placeholder={t("auth.tenant_name_placeholder")} autoComplete="organization" />
                  </div>
                </>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="email">{t("auth.email_label")}</Label>
                <Input id="email" name="email" type="email" required placeholder={t("auth.email_placeholder")} autoComplete="email" />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password">{t("auth.password_label")}</Label>
                <Input id="password" name="password" type="password" required placeholder="••••••••" autoComplete={mode === "login" ? "current-password" : "new-password"} />
              </div>

              {mode === "signup" && (
                <div className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-muted-foreground" style={{ direction: locale === "ar" ? "rtl" : "ltr" }}>
                  <Sparkles className="mt-0.5 size-3.5 shrink-0 text-primary" />
                  <span>{t("auth.trial_info")}</span>
                </div>
              )}
            </CardContent>

            <CardFooter className="mt-2 flex-col gap-3">
              <Button type="submit" size="lg" className="w-full" disabled={pending}>
                {pending
                  ? mode === "login" ? t("auth.login_loading") : t("auth.signup_loading")
                  : mode === "login" ? t("auth.login_button") : t("auth.signup_button")}
              </Button>
              <button
                type="button"
                onClick={() => setMode(mode === "login" ? "signup" : "login")}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                {mode === "login" ? (
                  <>
                    {t("auth.no_account")} <span className="font-semibold text-primary underline-offset-4 hover:underline">{t("auth.free_trial")}</span>
                  </>
                ) : (
                  <>
                    {t("auth.has_account")} <span className="font-semibold text-primary underline-offset-4 hover:underline">{t("auth.login_link")}</span>
                  </>
                )}
              </button>
            </CardFooter>
          </form>
        </Card>
      </main>
    </div>
  );
}
