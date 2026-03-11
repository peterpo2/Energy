import { contextBridge, ipcRenderer } from "electron";
import {
  EnergyDesktopApi,
  IpcChannels,
} from "@shared";

const energyApi: EnergyDesktopApi = {
  importFile: (payload) => ipcRenderer.invoke(IpcChannels.importFile, payload),
  cancelImport: (payload) => ipcRenderer.invoke(IpcChannels.cancelImport, payload),
  onImportProgress: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: Parameters<typeof listener>[0]) => {
      listener(payload);
    };
    ipcRenderer.on(IpcChannels.importProgress, handler);
    return () => ipcRenderer.removeListener(IpcChannels.importProgress, handler);
  },
  runAggregation: (payload) => ipcRenderer.invoke(IpcChannels.runAggregation, payload),
  runNightAnalysis: (payload) => ipcRenderer.invoke(IpcChannels.runNightAnalysis, payload),
  exportResults: (payload) => ipcRenderer.invoke(IpcChannels.exportResults, payload),
  deleteDataset: (payload) => ipcRenderer.invoke(IpcChannels.deleteDataset, payload),
  listDatasets: () => ipcRenderer.invoke(IpcChannels.listDatasets),
  getSettings: () => ipcRenderer.invoke(IpcChannels.getSettings),
  updateSettings: (payload) => ipcRenderer.invoke(IpcChannels.updateSettings, payload),
  getAppState: () => ipcRenderer.invoke(IpcChannels.getAppState),
  updateAppState: (payload) => ipcRenderer.invoke(IpcChannels.updateAppState, payload),
};

contextBridge.exposeInMainWorld("energyApi", energyApi);

declare global {
  interface Window {
    energyApi: EnergyDesktopApi;
  }
}
