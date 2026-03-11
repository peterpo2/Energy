import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AnalysisFilterDto, AppSettingsDto, DatasetListItemDto } from "@shared";
import { bgText } from "./i18n/bg";

interface AppState {
  activeDatasetId: string | null;
  datasets: DatasetListItemDto[];
  filters: AnalysisFilterDto;
  settings: AppSettingsDto;
  isHydrated: boolean;
  setActiveDatasetId: (datasetId: string | null) => Promise<void>;
  refreshDatasets: (preferredDatasetId?: string | null) => Promise<void>;
  reloadSettings: () => Promise<void>;
  setFilters: (next: Partial<AnalysisFilterDto>) => Promise<void>;
  setUiState: (nextActiveDatasetId: string | null, nextFilters: AnalysisFilterDto) => Promise<void>;
  setSettings: (next: Partial<AppSettingsDto>) => Promise<void>;
}

const defaultFilters: AnalysisFilterDto = {
  datasetId: null,
  fromUtcMs: null,
  toUtcMs: null,
  interval: "hourly",
};

const defaultSettings: AppSettingsDto = {
  analysisTimeZone: "UTC",
  expectedSamplingMinutes: 5,
  duplicateResolution: "keep_latest",
  defaultNightStart: "22:00",
  defaultNightEnd: "07:00",
  minCompletenessRatio: 0.8,
  minDaysRequiredForRecommendation: 5,
  maxSafeDeltaMinutes: 180,
};

const AppStateContext = createContext<AppState | null>(null);

function areFiltersEqual(left: AnalysisFilterDto, right: AnalysisFilterDto): boolean {
  return (
    left.datasetId === right.datasetId &&
    left.fromUtcMs === right.fromUtcMs &&
    left.toUtcMs === right.toUtcMs &&
    left.interval === right.interval
  );
}

export function AppStateProvider(props: { children: React.ReactNode }): JSX.Element {
  const [activeDatasetId, setActiveDatasetIdState] = useState<string | null>(null);
  const [datasets, setDatasets] = useState<DatasetListItemDto[]>([]);
  const [filters, setFiltersState] = useState<AnalysisFilterDto>(defaultFilters);
  const [settings, setSettingsState] = useState<AppSettingsDto>(defaultSettings);
  const [isHydrated, setIsHydrated] = useState(false);
  const activeDatasetIdRef = useRef<string | null>(null);
  const filtersRef = useRef<AnalysisFilterDto>(defaultFilters);
  const filterPersistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    activeDatasetIdRef.current = activeDatasetId;
  }, [activeDatasetId]);

  useEffect(() => {
    filtersRef.current = filters;
  }, [filters]);

  const applyUiStateLocally = (
    nextActiveDatasetId: string | null,
    nextFilters: AnalysisFilterDto,
  ): void => {
    activeDatasetIdRef.current = nextActiveDatasetId;
    filtersRef.current = nextFilters;
    setActiveDatasetIdState(nextActiveDatasetId);
    setFiltersState(nextFilters);
  };

  const refreshDatasets = async (preferredDatasetId?: string | null): Promise<void> => {
    const response = await window.energyApi.listDatasets();
    if (response.ok && response.data) {
      setDatasets(response.data.items);
      const currentActiveDatasetId = activeDatasetIdRef.current;
      const currentFilters = filtersRef.current;
      const preferredExisting =
        preferredDatasetId && response.data.items.some((item) => item.datasetId === preferredDatasetId)
          ? preferredDatasetId
          : null;
      const nextDatasetId =
        preferredExisting ??
        (currentActiveDatasetId &&
        response.data.items.some((item) => item.datasetId === currentActiveDatasetId)
          ? currentActiveDatasetId
          : response.data.items[0]?.datasetId ?? null);
      const nextFilters = { ...currentFilters, datasetId: nextDatasetId };
      applyUiStateLocally(nextDatasetId, nextFilters);

      if (
        currentActiveDatasetId !== nextDatasetId ||
        !areFiltersEqual(currentFilters, nextFilters)
      ) {
        await persistUiState(nextDatasetId, nextFilters);
      }
    }
  };

  const reloadSettings = async (): Promise<void> => {
    const response = await window.energyApi.getSettings();
    if (response.ok && response.data) {
      setSettingsState(response.data);
    }
  };

  const persistUiState = async (
    nextActiveDatasetId: string | null,
    nextFilters: AnalysisFilterDto,
  ): Promise<void> => {
    await window.energyApi.updateAppState({
      activeDatasetId: nextActiveDatasetId,
      filters: nextFilters,
    });
  };

  const schedulePersistUiState = (
    nextActiveDatasetId: string | null,
    nextFilters: AnalysisFilterDto,
    delayMs = 350,
  ): void => {
    if (filterPersistTimerRef.current) {
      clearTimeout(filterPersistTimerRef.current);
    }

    filterPersistTimerRef.current = setTimeout(() => {
      filterPersistTimerRef.current = null;
      void persistUiState(nextActiveDatasetId, nextFilters);
    }, delayMs);
  };

  const setActiveDatasetId = async (datasetId: string | null): Promise<void> => {
    const nextFilters = { ...filtersRef.current, datasetId };
    applyUiStateLocally(datasetId, nextFilters);
    if (filterPersistTimerRef.current) {
      clearTimeout(filterPersistTimerRef.current);
      filterPersistTimerRef.current = null;
    }
    await persistUiState(datasetId, nextFilters);
  };

  const setFilters = async (next: Partial<AnalysisFilterDto>): Promise<void> => {
    const merged = { ...filtersRef.current, ...next };
    const nextDatasetId =
      Object.prototype.hasOwnProperty.call(next, "datasetId") ? merged.datasetId : activeDatasetIdRef.current;
    const nextFilters = { ...merged, datasetId: nextDatasetId };
    applyUiStateLocally(nextDatasetId, nextFilters);
    schedulePersistUiState(nextDatasetId, nextFilters);
  };

  const setUiState = async (
    nextActiveDatasetId: string | null,
    nextFilters: AnalysisFilterDto,
  ): Promise<void> => {
    applyUiStateLocally(nextActiveDatasetId, nextFilters);
    if (filterPersistTimerRef.current) {
      clearTimeout(filterPersistTimerRef.current);
      filterPersistTimerRef.current = null;
    }
    await persistUiState(nextActiveDatasetId, nextFilters);
  };

  const setSettings = async (next: Partial<AppSettingsDto>): Promise<void> => {
    const response = await window.energyApi.updateSettings(next);
    if (response.ok && response.data) {
      setSettingsState(response.data);
      return;
    }

    throw new Error(response.error?.message ?? bgText.settings.saveFailed);
  };

  useEffect(() => {
    const hydrate = async (): Promise<void> => {
      const [datasetsResponse, settingsResponse, appStateResponse] = await Promise.all([
        window.energyApi.listDatasets(),
        window.energyApi.getSettings(),
        window.energyApi.getAppState(),
      ]);

      if (datasetsResponse.ok && datasetsResponse.data) {
        setDatasets(datasetsResponse.data.items);
      }

      if (settingsResponse.ok && settingsResponse.data) {
        setSettingsState(settingsResponse.data);
      }

      if (appStateResponse.ok && appStateResponse.data) {
      setActiveDatasetIdState(appStateResponse.data.activeDatasetId);
      setFiltersState(appStateResponse.data.filters);
      activeDatasetIdRef.current = appStateResponse.data.activeDatasetId;
      filtersRef.current = appStateResponse.data.filters;
      }

      setIsHydrated(true);
    };

    void hydrate();

    return () => {
      if (filterPersistTimerRef.current) {
        clearTimeout(filterPersistTimerRef.current);
      }
    };
  }, []);

  const value = useMemo<AppState>(
    () => ({
      activeDatasetId,
      datasets,
      filters,
      settings,
      isHydrated,
      setActiveDatasetId,
      refreshDatasets,
      reloadSettings,
      setFilters,
      setUiState,
      setSettings,
    }),
    [activeDatasetId, datasets, filters, settings, isHydrated],
  );

  return <AppStateContext.Provider value={value}>{props.children}</AppStateContext.Provider>;
}

export function useAppState(): AppState {
  const context = useContext(AppStateContext);
  if (!context) {
    throw new Error("useAppState must be used inside AppStateProvider.");
  }
  return context;
}
