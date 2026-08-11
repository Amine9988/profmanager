"use client";

import { useEffect } from "react";
import { ensureLanBase } from "@/lib/scan-base";

export function LanBaseProvider() {
  useEffect(() => {
    ensureLanBase();
  }, []);
  return null;
}
