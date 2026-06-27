"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function LoginForm() {
  const [loading, setLoading] = useState(false);

  return (
    <form
      action="/api/auth/login"
      method="POST"
      onSubmit={() => setLoading(true)}
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">
            Email
          </label>
          <Input
            type="email"
            name="email"
            required
            placeholder="votre@email.com"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">
            Mot de passe
          </label>
          <Input
            type="password"
            name="password"
            required
            placeholder="••••••••"
          />
        </div>

        <Button
          type="submit"
          disabled={loading}
          className="w-full h-11"
        >
          {loading ? "Connexion..." : "Se connecter"}
        </Button>
      </div>
    </form>
  );
}
