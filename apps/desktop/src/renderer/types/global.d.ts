import type { EnergyDesktopApi } from "@shared";

declare global {
  interface Window {
    energyApi: EnergyDesktopApi;
  }
}

export {};
