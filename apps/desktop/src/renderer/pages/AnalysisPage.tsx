import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  HourlyConsumptionProfilePointDto,
  LowestConsumptionPeriodType,
  RunAggregationResponseDto,
} from "@shared";
import { useLocation, useNavigate } from "react-router-dom";
import { useAppState } from "../app/store";
import { TOPBAR_RUN_EVENT } from "../app/events";
import { bgText } from "../app/i18n/bg";

function formatDateTime(value: number | null): string {
  return value ? new Date(value).toLocaleString("bg-BG") : bgText.analysis.noSummaryRange;
}

function toLocalInputDate(value: number | null): string {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toLocalInputTime(value: number | null): string {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function mergeDateAndTime(dateValue: string, timeValue: string, fallbackValue: number | null): number | null {
  if (!dateValue && !timeValue) {
    return null;
  }

  const fallback = fallbackValue ? new Date(fallbackValue) : new Date();
  const safeDate = dateValue || toLocalInputDate(fallback.getTime());
  const safeTime = timeValue || toLocalInputTime(fallback.getTime()) || "00:00";
  const composed = new Date(`${safeDate}T${safeTime}`);
  return Number.isNaN(composed.getTime()) ? fallbackValue : composed.getTime();
}

function buildMetricExplanation(
  result: RunAggregationResponseDto | null,
  metric: "hourly" | "daily" | "monthly" | "averageConsumption" | "totalConsumption" | "gaps",
): string {
  if (!result) {
    return bgText.analysis.noChartData;
  }

  switch (metric) {
    case "hourly":
      if (result.hourlyCount === 0) {
        return bgText.analysis.tooltipHourlyZero;
      }
      if (result.hourlyCount < 12) {
        return bgText.analysis.tooltipHourlyLow;
      }
      return `${bgText.analysis.tooltipHourlyOk} Текуща стойност: ${result.hourlyCount}.`;
    case "daily":
      if (result.dailyCount === 0) {
        return bgText.analysis.tooltipDailyZero;
      }
      return `${bgText.analysis.tooltipDailyOk} Текуща стойност: ${result.dailyCount}.`;
    case "monthly":
      if (result.monthlyCount === 0) {
        return bgText.analysis.tooltipMonthlyZero;
      }
      return `${bgText.analysis.tooltipMonthlyOk} Текуща стойност: ${result.monthlyCount}.`;
    case "averageConsumption": {
      const averageConsumption = result.summary.overallAverageConsumptionW;

      if (averageConsumption <= 0) {
        return bgText.analysis.tooltipAverageConsumptionZero;
      }

      return `${bgText.analysis.tooltipAverageConsumptionOk} Текуща стойност: ${averageConsumption.toFixed(0)} W.`;
    }
    case "totalConsumption": {
      const totalConsumption = result.summary.overallTotalConsumptionKwh;

      if (totalConsumption <= 0) {
        return bgText.analysis.tooltipTotalConsumptionZero;
      }

      return `${bgText.analysis.tooltipTotalConsumptionOk} Текуща стойност: ${totalConsumption.toFixed(3)} kWh.`;
    }
    case "gaps":
      if (result.summary.totalGapCount === 0) {
        return bgText.analysis.tooltipGapsZero;
      }
      if (result.summary.totalGapCount < 20) {
        return `${bgText.analysis.tooltipGapsLow} Текуща стойност: ${result.summary.totalGapCount}.`;
      }
      return `${bgText.analysis.tooltipGapsHigh} Текуща стойност: ${result.summary.totalGapCount}.`;
  }
}

function BarConsumptionChart(props: { data: HourlyConsumptionProfilePointDto[] }): JSX.Element {
  const data = props.data;
  const maxValue = Math.max(...data.map((item) => item.averageConsumptionW), 0);

  if (maxValue <= 0) {
    return <p className="panel-text">{bgText.analysis.noChartData}</p>;
  }

  return (
    <div className="bar-chart">
      {data.map((item) => {
        const heightPercent = maxValue > 0 ? (item.averageConsumptionW / maxValue) * 100 : 0;
        return (
          <div key={item.label} className="bar-chart-column">
            <div className="bar-chart-value mono">{item.averageConsumptionW.toFixed(0)}</div>
            <div className="bar-chart-track">
              <div className="bar-chart-fill" style={{ height: `${heightPercent}%` }} />
            </div>
            <div className="bar-chart-label mono">{item.label.slice(0, 2)}</div>
            <div className="bar-chart-tooltip" role="tooltip">
              <span className="bar-chart-tooltip-title">{item.label}</span>
              <span className="bar-chart-tooltip-value mono">
                {item.averageConsumptionW.toFixed(0)} W средно потребление
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function AnalysisPage(): JSX.Element {
  const { activeDatasetId, datasets, filters, setFilters } = useAppState();
  const location = useLocation();
  const navigate = useNavigate();
  const [isRunning, setIsRunning] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [result, setResult] = useState<RunAggregationResponseDto | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lowestConsumptionPeriodType, setLowestConsumptionPeriodType] =
    useState<LowestConsumptionPeriodType>("five_minute");
  const isRunningRef = useRef(false);
  const lastRunSignatureRef = useRef<string | null>(null);
  const lastRunAtRef = useRef(0);
  const activeDataset = datasets.find((item) => item.datasetId === activeDatasetId) ?? null;
  const activeDatasetValid = (activeDataset?.rowCountNormalized ?? 0) > 0;
  const importRedirectStatus =
    typeof (location.state as { importStatus?: unknown } | null)?.importStatus === "string"
      ? ((location.state as { importStatus?: string }).importStatus ?? null)
      : null;

  const runAnalysis = useCallback(async (): Promise<void> => {
    if (!activeDatasetId) {
      setError(bgText.common.noActiveDataset);
      return;
    }

    if (!activeDatasetValid) {
      setError(bgText.analysis.invalidDatasetNoMeasurements);
      return;
    }

    const requestSignature = JSON.stringify({
      datasetId: activeDatasetId,
      fromUtcMs: filters.fromUtcMs ?? null,
      toUtcMs: filters.toUtcMs ?? null,
      interval: filters.interval,
    });
    const now = Date.now();
    if (isRunningRef.current) {
      return;
    }
    if (lastRunSignatureRef.current === requestSignature && now - lastRunAtRef.current < 1200) {
      return;
    }

    isRunningRef.current = true;
    lastRunSignatureRef.current = requestSignature;
    lastRunAtRef.current = now;
    setIsRunning(true);
    setError(null);
    setStatusMessage(null);
    try {
      if (filters.fromUtcMs && filters.toUtcMs && filters.fromUtcMs > filters.toUtcMs) {
        throw new Error(bgText.analysis.rangeInvalid);
      }

      const response = await window.energyApi.runAggregation({
        datasetId: activeDatasetId,
        fromUtcMs: filters.fromUtcMs ?? undefined,
        toUtcMs: filters.toUtcMs ?? undefined,
      });

      if (!response.ok || !response.data) {
        throw new Error(response.error?.message ?? bgText.analysis.executionFailed);
      }

      setResult(response.data);
      setStatusMessage(response.data.message ?? null);
    } catch (nextError) {
      setResult(null);
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      isRunningRef.current = false;
      setIsRunning(false);
    }
  }, [activeDatasetId, activeDatasetValid, filters.fromUtcMs, filters.interval, filters.toUtcMs]);

  const exportResults = useCallback(
    async (format: "csv" | "xlsx"): Promise<void> => {
      if (!activeDatasetId) {
        setError(bgText.common.noActiveDataset);
        return;
      }

      setIsExporting(true);
      setError(null);
      try {
        const response = await window.energyApi.exportResults({
          datasetId: activeDatasetId,
          exportType: "aggregates",
          format,
        });

        if (!response.ok || !response.data) {
          throw new Error(response.error?.message ?? bgText.analysis.exportFailed);
        }

        setStatusMessage(`${bgText.analysis.exportSuccess}: ${response.data.filePath}`);
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : bgText.analysis.exportFailed);
      } finally {
        setIsExporting(false);
      }
    },
    [activeDatasetId],
  );

  useEffect(() => {
    const handler = (): void => {
      void runAnalysis();
    };

    window.addEventListener(TOPBAR_RUN_EVENT, handler);
    return () => window.removeEventListener(TOPBAR_RUN_EVENT, handler);
  }, [runAnalysis]);

  useEffect(() => {
    if (!importRedirectStatus) {
      return;
    }

    setStatusMessage(importRedirectStatus);
    navigate(location.pathname, { replace: true });
  }, [importRedirectStatus, location.pathname, navigate]);

  const hourlyProfile = useMemo(() => result?.hourlyConsumptionProfile ?? [], [result]);
  const averageConsumptionW = result?.summary.overallAverageConsumptionW ?? 0;
  const totalConsumptionKwh = result?.summary.overallTotalConsumptionKwh ?? 0;

  const fromDate = toLocalInputDate(filters.fromUtcMs);
  const fromTime = toLocalInputTime(filters.fromUtcMs);
  const toDate = toLocalInputDate(filters.toUtcMs);
  const toTime = toLocalInputTime(filters.toUtcMs);
  const lowestConsumptionItem =
    result?.lowestConsumptionPeriods.find((item) => item.periodType === lowestConsumptionPeriodType) ?? null;

  return (
    <section className="page-grid analysis-layout">
      <article className="panel panel-primary panel-span-2">
        <div className="panel-header-row">
          <h2 className="panel-title">{bgText.analysis.title}</h2>
          <div className="action-row">
            <button type="button" className="btn" disabled={isExporting} onClick={() => void exportResults("csv")}>
              {bgText.analysis.exportCsv}
            </button>
            <button type="button" className="btn" disabled={isExporting} onClick={() => void exportResults("xlsx")}>
              {bgText.analysis.exportXlsx}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void runAnalysis()}
              disabled={isRunning || !activeDatasetValid}
            >
              {isRunning ? bgText.analysis.running : bgText.analysis.runAction}
            </button>
          </div>
        </div>
        <p className="panel-text">{bgText.analysis.text}</p>
        <div className="form-grid form-grid-compact form-grid-analysis">
          <label className="field">
            <span className="field-label">{bgText.analysis.activeDatasetLabel}</span>
            <div className="field-static">{activeDataset?.sourceFileName ?? bgText.common.noActiveDataset}</div>
          </label>
          <label className="field">
            <span className="field-label">{bgText.analysis.intervalLabel}</span>
            <select
              className="field-input"
              value={filters.interval}
              onChange={(event) => void setFilters({ interval: event.target.value as typeof filters.interval })}
            >
              <option value="hourly">{bgText.topBar.intervalHourly}</option>
              <option value="daily">{bgText.topBar.intervalDaily}</option>
              <option value="monthly">{bgText.topBar.intervalMonthly}</option>
            </select>
          </label>
          <label className="field">
            <span className="field-label">{bgText.analysis.fromLabel}</span>
            <div className="datetime-split">
              <div className="field">
                <span className="field-label field-label-inline">{bgText.analysis.dateLabel}</span>
                <input
                  className="field-input"
                  type="date"
                  value={fromDate}
                  onChange={(event) =>
                    void setFilters({
                      fromUtcMs: mergeDateAndTime(event.target.value, fromTime, filters.fromUtcMs),
                    })
                  }
                />
              </div>
              <div className="field">
                <span className="field-label field-label-inline">{bgText.analysis.timeLabel}</span>
                <input
                  className="field-input"
                  type="time"
                  step={300}
                  value={fromTime}
                  onChange={(event) =>
                    void setFilters({
                      fromUtcMs: mergeDateAndTime(fromDate, event.target.value, filters.fromUtcMs),
                    })
                  }
                />
              </div>
            </div>
          </label>
          <label className="field">
            <span className="field-label">{bgText.analysis.toLabel}</span>
            <div className="datetime-split">
              <div className="field">
                <span className="field-label field-label-inline">{bgText.analysis.dateLabel}</span>
                <input
                  className="field-input"
                  type="date"
                  value={toDate}
                  onChange={(event) =>
                    void setFilters({
                      toUtcMs: mergeDateAndTime(event.target.value, toTime, filters.toUtcMs),
                    })
                  }
                />
              </div>
              <div className="field">
                <span className="field-label field-label-inline">{bgText.analysis.timeLabel}</span>
                <input
                  className="field-input"
                  type="time"
                  step={300}
                  value={toTime}
                  onChange={(event) =>
                    void setFilters({
                      toUtcMs: mergeDateAndTime(toDate, event.target.value, filters.toUtcMs),
                    })
                  }
                />
              </div>
            </div>
          </label>
        </div>
      </article>

      <div className="analysis-main-column">
        <article className={`panel panel-status-strip${error ? " panel-status-strip-error" : ""}`}>
          <div className="status-strip-content">
            {error ? `${bgText.import.errorPrefix}: ${error}` : statusMessage ?? bgText.analysis.importRedirectStatus}
          </div>
        </article>

        <article className="panel panel-chart-large">
          <h2 className="panel-title">{bgText.analysis.barChartTitle}</h2>
          <BarConsumptionChart data={hourlyProfile} />
        </article>
      </div>

      <div className="analysis-side-column">
        <article className="panel panel-analysis-quality">
          <h2 className="panel-title">{bgText.analysis.qualityTitle}</h2>
          <p className="panel-text">{bgText.analysis.qualityText}</p>
          <div className="metric-grid metric-grid-analysis">
            <div className="metric-card metric-card-help">
              <span className="metric-label">{bgText.analysis.summaryHourly}</span>
              <span className="metric-value mono">{result?.hourlyCount ?? 0}</span>
              <div className="metric-tooltip">
                <span className="metric-tooltip-title">{bgText.analysis.metricHelpLabel}</span>
                <span>{buildMetricExplanation(result, "hourly")}</span>
              </div>
            </div>
            <div className="metric-card metric-card-help">
              <span className="metric-label">{bgText.analysis.summaryDaily}</span>
              <span className="metric-value mono">{result?.dailyCount ?? 0}</span>
              <div className="metric-tooltip">
                <span className="metric-tooltip-title">{bgText.analysis.metricHelpLabel}</span>
                <span>{buildMetricExplanation(result, "daily")}</span>
              </div>
            </div>
            <div className="metric-card metric-card-help">
              <span className="metric-label">{bgText.analysis.summaryMonthly}</span>
              <span className="metric-value mono">{result?.monthlyCount ?? 0}</span>
              <div className="metric-tooltip">
                <span className="metric-tooltip-title">{bgText.analysis.metricHelpLabel}</span>
                <span>{buildMetricExplanation(result, "monthly")}</span>
              </div>
            </div>
            <div className="metric-card metric-card-help metric-card-kpi">
              <span className="metric-label">{bgText.analysis.summaryAverageConsumption}</span>
              <span className="metric-value mono">{averageConsumptionW.toFixed(0)} W</span>
              <div className="metric-tooltip">
                <span className="metric-tooltip-title">{bgText.analysis.metricHelpLabel}</span>
                <span>{buildMetricExplanation(result, "averageConsumption")}</span>
              </div>
            </div>
            <div className="metric-card metric-card-help metric-card-kpi">
              <span className="metric-label">{bgText.analysis.summaryTotalConsumption}</span>
              <span className="metric-value mono">{totalConsumptionKwh.toFixed(3)} kWh</span>
              <div className="metric-tooltip">
                <span className="metric-tooltip-title">{bgText.analysis.metricHelpLabel}</span>
                <span>{buildMetricExplanation(result, "totalConsumption")}</span>
              </div>
            </div>
            <div className="metric-card metric-card-help">
              <span className="metric-label">{bgText.analysis.summaryGaps}</span>
              <span className="metric-value mono">{result?.summary.totalGapCount ?? 0}</span>
              <div className="metric-tooltip">
                <span className="metric-tooltip-title">{bgText.analysis.metricHelpLabel}</span>
                <span>{buildMetricExplanation(result, "gaps")}</span>
              </div>
            </div>
          </div>
          <div className="range-grid">
            <div className="summary-item summary-item-compact">
              <span className="summary-label">{bgText.analysis.summaryRange}</span>
              <span className="summary-value">
                {result
                  ? `${formatDateTime(result.summary.firstBucketUtcMs)} -> ${formatDateTime(result.summary.lastBucketUtcMs)}`
                  : bgText.analysis.noSummaryRange}
              </span>
            </div>
            <div className="summary-item summary-item-compact">
              <span className="summary-label">{bgText.analysis.timeZoneLabel}</span>
              <span className="summary-value">{result?.timeZone ?? "-"}</span>
            </div>
          </div>
        </article>

        <article className="panel panel-analysis-lowest">
          <div className="panel-header-row lowest-consumption-header">
            <h3 className="panel-title panel-title-small">{bgText.analysis.lowestConsumptionTitle}</h3>
            <label className="field field-inline">
              <span className="field-label field-label-inline">{bgText.analysis.lowestConsumptionPeriodLabel}</span>
              <select
                className="field-input field-input-compact"
                value={lowestConsumptionPeriodType}
                onChange={(event) => setLowestConsumptionPeriodType(event.target.value as LowestConsumptionPeriodType)}
              >
                <option value="five_minute">{bgText.analysis.lowestConsumptionFiveMinute}</option>
                <option value="hourly">{bgText.analysis.lowestConsumptionHourly}</option>
                <option value="daily">{bgText.analysis.lowestConsumptionDaily}</option>
              </select>
            </label>
          </div>
          {lowestConsumptionItem ? (
            <div className="lowest-consumption-grid">
              <div className="summary-item summary-item-compact">
                <span className="summary-label">{bgText.analysis.lowestConsumptionRangeLabel}</span>
                <span className="summary-value">{lowestConsumptionItem.label}</span>
              </div>
              <div className="summary-item summary-item-compact">
                <span className="summary-label">{bgText.analysis.lowestConsumptionValueLabel}</span>
                <span className="summary-value mono">{lowestConsumptionItem.averageConsumptionW.toFixed(0)} W</span>
              </div>
              <div className="summary-item summary-item-compact">
                <span className="summary-label">{bgText.analysis.lowestConsumptionEnergyLabel}</span>
                <span className="summary-value mono">{lowestConsumptionItem.estimatedKwh.toFixed(3)} kWh</span>
              </div>
            </div>
          ) : (
            <p className="panel-text">{bgText.analysis.lowestConsumptionNoData}</p>
          )}
        </article>
      </div>
    </section>
  );
}

