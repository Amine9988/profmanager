"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { searchStudents } from "@/server/actions/search";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Search, Users, Phone, BookOpen, Command } from "@/lib/lucide";
import { useT } from "@/lib/i18n";

type SearchResult = {
  id: string;
  fullName: string;
  phone: string;
  gradeLevel: string;
  groups: string[];
};

export function CommandPalette() {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener("open-search", handler);

    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    document.addEventListener("keydown", down);
    return () => {
      window.removeEventListener("open-search", handler);
      document.removeEventListener("keydown", down);
    };
  }, []);

  useEffect(() => {
    if (!open) {
      requestAnimationFrame(() => {
        setQuery("");
        setResults([]);
      });
    } else {
      inputRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    requestAnimationFrame(() => setSelectedIndex(0));
    if (query.trim().length < 1) {
      setResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      const res = await searchStudents(query);
      setResults(res);
    }, 200);
    return () => clearTimeout(timer);
  }, [query]);

  const navigate = useCallback(
    (id: string) => {
      setOpen(false);
      router.push(`/students/${id}`);
    },
    [router]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && results[selectedIndex]) {
      navigate(results[selectedIndex].id);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="top-[15%] max-w-lg p-0 gap-0 overflow-hidden">
        <div className="flex items-center border-b px-4">
          <Search className="mr-3 size-4 shrink-0 text-muted-foreground/60" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t("search.placeholder")}
            className="h-12 border-0 bg-transparent px-0 text-base focus-visible:ring-0 placeholder:text-muted-foreground/40"
          />
          <kbd className="shrink-0 inline-flex h-6 items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground/60">
            <Command className="size-3" />K
          </kbd>
        </div>
        <div className="max-h-72 overflow-y-auto p-2">
          {results.length === 0 && query.trim().length > 0 && (
            <div className="flex flex-col items-center gap-2 p-6 text-center">
              <Users className="size-6 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">{t("search.no_results")}</p>
            </div>
          )}
          {results.map((r, i) => (
            <button
              key={r.id}
              onClick={() => navigate(r.id)}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-all duration-150 ${
                i === selectedIndex ? "bg-accent" : "hover:bg-accent/50"
              }`}
            >
              <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <Users className="size-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{r.fullName}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {r.phone && (
                    <span className="inline-flex items-center gap-1 mr-3">
                      <Phone className="size-3" /> {r.phone}
                    </span>
                  )}
                  {r.groups.length > 0 && (
                    <span className="inline-flex items-center gap-1">
                      <BookOpen className="size-3" /> {r.groups.join(", ")}
                    </span>
                  )}
                </p>
              </div>
              {r.gradeLevel && (
                <span className="shrink-0 text-xs text-muted-foreground bg-muted rounded-md px-2 py-0.5">{r.gradeLevel}</span>
              )}
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
