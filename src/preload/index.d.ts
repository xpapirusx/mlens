import type { MlensApi } from "@shared/ipc";

declare global {
  interface Window {
    mlens: MlensApi;
  }
}

export {};
