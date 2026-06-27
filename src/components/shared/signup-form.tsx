"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signup, type ActionState } from "@/server/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useT } from "@/lib/i18n";

export function SignupForm() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(signup, null);
  const t = useT();

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>{t("auth.signup_title")}</CardTitle>
        <CardDescription>{t("auth.signup_desc")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="tenantName">{t("auth.tenant_name")}</Label>
            <Input
              id="tenantName"
              name="tenantName"
              required
              placeholder={t("auth.tenant_name_placeholder")}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="fullName">{t("auth.full_name")}</Label>
            <Input id="fullName" name="fullName" required placeholder={t("auth.full_name_placeholder")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">{t("auth.email")}</Label>
            <Input id="email" name="email" type="email" required placeholder={t("auth.email_placeholder")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">{t("auth.password")}</Label>
            <Input id="password" name="password" type="password" required minLength={8} />
          </div>
          {state?.error && (
            <p className="text-sm text-destructive" role="alert">
              {state.error}
            </p>
          )}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? t("auth.signup_loading") : t("auth.signup_button")}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          {t("auth.has_account")}{" "}
          <Link href="/login" className="text-primary underline-offset-4 hover:underline">
            {t("auth.login_link")}
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
