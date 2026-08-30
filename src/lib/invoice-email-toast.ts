import { toast } from "sonner";

type MailResult = {
  sent?: boolean;
  to?: string;
  reason?: string;
} | null | undefined;

export function toastInvoiceEmail(
  t: (key: string, values?: Record<string, string | number>) => string,
  mail: MailResult
) {
  if (!mail) return;
  if (mail.sent) {
    toast.success(t("payments.invoice_emailed", { email: mail.to || "" }));
    return;
  }
  if (mail.reason === "no_parent_email") toast.message(t("payments.invoice_email_no_parent"));
  else if (mail.reason === "smtp_not_configured") toast.message(t("payments.invoice_email_no_smtp"));
  else if (mail.reason === "auth_failed") toast.error(t("payments.invoice_email_auth_failed"));
  else if (mail.reason === "send_failed") toast.error(t("payments.invoice_email_failed"));
}
