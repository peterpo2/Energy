import { useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { useAppState } from "../../app/store";
import { TOPBAR_REFRESH_EVENT, TOPBAR_RUN_EVENT } from "../../app/events";
import { bgText } from "../../app/i18n/bg";

const titles: Record<string, string> = {
  "/import": bgText.navigation.import,
  "/analysis": bgText.navigation.analysis,
  "/history": bgText.navigation.history,
  "/settings": bgText.navigation.settings,
};

export function TopBar(): JSX.Element {
  const location = useLocation();
  const { activeDatasetId, filters, datasets, refreshDatasets, reloadSettings } = useAppState();
  const [status, setStatus] = useState<string | null>(null);
  const activeDataset = datasets.find((item) => item.datasetId === activeDatasetId) ?? null;
  const activeDatasetValid = (activeDataset?.rowCountNormalized ?? 0) > 0;

  const intervalLabel =
    filters.interval === "hourly"
      ? bgText.topBar.intervalHourly
      : filters.interval === "daily"
        ? bgText.topBar.intervalDaily
        : bgText.topBar.intervalMonthly;

  const canRun = useMemo(
    () => location.pathname === "/import" || (location.pathname === "/analysis" && activeDatasetValid),
    [activeDatasetValid, location.pathname],
  );

  const handleRefresh = async (): Promise<void> => {
    await Promise.all([refreshDatasets(), reloadSettings()]);
    window.dispatchEvent(new Event(TOPBAR_REFRESH_EVENT));
    setStatus(bgText.topBar.refreshDone);
    window.setTimeout(() => setStatus(null), 2200);
  };

  const handleRun = (): void => {
    if (!canRun) {
      setStatus(location.pathname === "/analysis" ? bgText.topBar.runUnavailableInvalid : bgText.topBar.runUnavailable);
      window.setTimeout(() => setStatus(null), 2200);
      return;
    }

    window.dispatchEvent(new Event(TOPBAR_RUN_EVENT));
    setStatus(null);
  };

  return (
    <header className="topbar">
      <div className="topbar-title-block">
        <div className="topbar-title">{titles[location.pathname] ?? bgText.appName}</div>
        <div className="topbar-subtitle">
          {bgText.topBar.activeDataset}: {activeDataset?.sourceFileName ?? bgText.topBar.none} | {bgText.topBar.interval}: {intervalLabel} | {bgText.topBar.totalDatasets}: {datasets.length}
          {status ? ` | ${status}` : ""}
        </div>
      </div>
      <div className="topbar-actions">
        <button type="button" className="btn btn-secondary" onClick={() => void handleRefresh()}>
          {bgText.topBar.refresh}
        </button>
        <button type="button" className="btn btn-primary" onClick={handleRun} disabled={!canRun}>
          {bgText.topBar.run}
        </button>
      </div>
    </header>
  );
}
