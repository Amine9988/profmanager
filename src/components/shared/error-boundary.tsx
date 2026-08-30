"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RotateCcw, RefreshCw } from "@/lib/lucide";

interface Props { children: React.ReactNode; }
interface State { hasError: boolean; error: Error | null; }

const T = {
  title: {
    fr: "Une erreur est survenue",
    en: "An error occurred",
    ar: "حدث خطأ",
  },
  unknown: {
    fr: "Erreur inconnue",
    en: "Unknown error",
    ar: "خطأ غير معروف",
  },
  retry: {
    fr: "Réessayer",
    en: "Retry",
    ar: "إعادة المحاولة",
  },
  reload: {
    fr: "Recharger",
    en: "Reload",
    ar: "إعادة التحميل",
  },
};

function lang(): "fr" | "en" | "ar" {
  if (typeof window === "undefined") return "fr";
  const html = document.documentElement.lang;
  if (html === "ar" || html === "en") return html;
  return "fr";
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      const l = lang();
      return (
        <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4 p-8 animate-fade-in">
          <div className="rounded-full bg-destructive/10 p-4">
            <AlertTriangle className="size-8 text-destructive" />
          </div>
          <h2 className="text-lg font-semibold">{T.title[l]}</h2>
          <p className="text-sm text-muted-foreground max-w-md text-center">
            {this.state.error?.message || T.unknown[l]}
          </p>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => this.setState({ hasError: false, error: null })}>
              <RotateCcw className="size-4 mr-1" />{T.retry[l]}
            </Button>
            <Button onClick={() => window.location.reload()}>
              <RefreshCw className="size-4 mr-1" />{T.reload[l]}
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
