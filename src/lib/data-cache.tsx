"use client";

import { createContext, useContext, useState, type ReactNode, useCallback } from "react";

interface CachedData {
  levels: any[];
  subjects: any[];
  rooms: any[];
  teachers: any[];
}

interface DataCacheContextType {
  data: CachedData;
  getLevels: () => Promise<any[]>;
  getSubjects: () => Promise<any[]>;
  getRooms: () => Promise<any[]>;
  getTeachers: () => Promise<any[]>;
  invalidate: (key: keyof CachedData) => void;
  invalidateAll: () => void;
}

const EMPTY: CachedData = { levels: [], subjects: [], rooms: [], teachers: [] };

const DataCacheCtx = createContext<DataCacheContextType | null>(null);

export function DataCacheProvider({ children }: { children: ReactNode }) {
  const [cache, setCache] = useState<CachedData>(EMPTY);
  const [fetching, setFetching] = useState<Set<keyof CachedData>>(new Set());

  const fetchIfMissing = useCallback(async (key: keyof CachedData, url: string) => {
    if (cache[key].length > 0 || fetching.has(key)) return cache[key];
    setFetching((prev) => new Set(prev).add(key));
    try {
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        const items = Array.isArray(data) ? data : [];
        setCache((prev) => ({ ...prev, [key]: items }));
        return items;
      }
    } catch {
      // ignore
    } finally {
      setFetching((prev) => { const next = new Set(prev); next.delete(key); return next; });
    }
    return [];
  }, [cache, fetching]);

  const getLevels = useCallback(() => fetchIfMissing("levels", "/api/levels"), [fetchIfMissing]);
  const getSubjects = useCallback(() => fetchIfMissing("subjects", "/api/subjects"), [fetchIfMissing]);
  const getRooms = useCallback(() => fetchIfMissing("rooms", "/api/rooms"), [fetchIfMissing]);
  const getTeachers = useCallback(() => fetchIfMissing("teachers", "/api/teachers"), [fetchIfMissing]);

  const invalidate = useCallback((key: keyof CachedData) => {
    setCache((prev) => ({ ...prev, [key]: [] }));
  }, []);

  const invalidateAll = useCallback(() => {
    setCache(EMPTY);
  }, []);

  return (
    <DataCacheCtx.Provider value={{ data: cache, getLevels, getSubjects, getRooms, getTeachers, invalidate, invalidateAll }}>
      {children}
    </DataCacheCtx.Provider>
  );
}

export function useDataCache() {
  const ctx = useContext(DataCacheCtx);
  if (!ctx) throw new Error("useDataCache must be used within DataCacheProvider");
  return ctx;
}
