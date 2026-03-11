export const IpcChannels = {
  importFile: "energy.importFile",
  cancelImport: "energy.cancelImport",
  importProgress: "energy.importProgress",
  runAggregation: "energy.runAggregation",
  runNightAnalysis: "energy.runNightAnalysis",
  exportResults: "energy.exportResults",
  deleteDataset: "energy.deleteDataset",
  listDatasets: "energy.listDatasets",
  getSettings: "energy.getSettings",
  updateSettings: "energy.updateSettings",
  getAppState: "energy.getAppState",
  updateAppState: "energy.updateAppState",
} as const;

export type IpcChannelName = (typeof IpcChannels)[keyof typeof IpcChannels];
