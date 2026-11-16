import { useEffect, useState } from "react";
import type { AppInfo } from "@shared/types";
import { api } from "./api";

let cached: AppInfo | null = null;

export function useAppInfo(): AppInfo | null {
  const [info, setInfo] = useState<AppInfo | null>(cached);
  useEffect(() => {
    if (cached) return;
    void api.app.info().then((value) => {
      cached = value;
      setInfo(value);
    });
  }, []);
  return info;
}
