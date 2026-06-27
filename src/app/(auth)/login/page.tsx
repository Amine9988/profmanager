import LoginForm from "@/components/shared/login-form";
import { GraduationCap } from "lucide-react";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;

  return (
    <div className="w-full max-w-sm">
      <div className="bg-card rounded-2xl shadow-lg border p-8">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center size-12 rounded-xl bg-primary/10 mb-4">
            <GraduationCap className="size-6 text-primary" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">ProfManager</h1>
          <p className="text-sm text-muted-foreground mt-1">Connectez-vous à votre espace</p>
        </div>

        {params.error && (
          <div className="mb-4 p-3 bg-destructive/5 border border-destructive/20 rounded-lg">
            <p className="text-destructive text-sm text-center">{params.error}</p>
          </div>
        )}

        <LoginForm />
      </div>
    </div>
  );
}
