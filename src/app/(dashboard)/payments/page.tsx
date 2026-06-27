import PaymentsList from "@/components/payments/PaymentsList";
import { getT, getInitialLocale } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export default async function PaymentsPage() {
  const locale = await getInitialLocale();
  const t = await getT(locale);
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const months: { value: string; label: string }[] = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(year, month - 1 - i, 1);
    const label = d.toLocaleDateString(locale === "ar" ? "ar-DZ" : locale === "en" ? "en-US" : "fr-FR", {
      year: "numeric",
      month: "long",
    });
    months.push({ value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, label });
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <h1 className="text-2xl font-bold">{t("payments.title")}</h1>
      <PaymentsList year={year} month={month} />
    </div>
  );
}
