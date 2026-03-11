import { useCallback, useEffect, useMemo, useState } from "react";
import { ImportFileResponseDto, ImportProgressEventDto } from "@shared";
import { useNavigate } from "react-router-dom";
import { useAppState } from "../app/store";
import { TOPBAR_RUN_EVENT } from "../app/events";
import { bgText } from "../app/i18n/bg";

function formatTimeRange(fromUtcMs: number | null, toUtcMs: number | null): string {
  if (!fromUtcMs || !toUtcMs) {
    return bgText.import.noTimeRange;
  }

  return `${new Date(fromUtcMs).toLocaleString("bg-BG")} -> ${new Date(toUtcMs).toLocaleString("bg-BG")}`;
}

function createImportJobId(): string {
  return `import-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function ImportPage(): JSX.Element {
  const { setUiState, refreshDatasets } = useAppState();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [result, setResult] = useState<ImportFileResponseDto | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [progress, setProgress] = useState<ImportProgressEventDto | null>(null);

  const statusText = useMemo(() => {
    if (isLoading) {
      return progress?.message ?? bgText.import.loadingStatus;
    }
    if (errorText) {
      return `${bgText.import.errorPrefix}: ${errorText}`;
    }
    if (result) {
      if (result.rowCountNormalized === 0) {
        return bgText.import.invalidStatus;
      }
      return bgText.import.successStatus;
    }
    return bgText.import.idleStatus;
  }, [errorText, isLoading, progress?.message, result]);

  const handleImport = useCallback(async (): Promise<void> => {
    const jobId = createImportJobId();
    setActiveJobId(jobId);
    setProgress({
      jobId,
      phase: "starting",
      progressPercent: 0,
      message: bgText.import.loadingStatus,
      canCancel: true,
    });
    setIsLoading(true);
    setErrorText(null);

    try {
      const response = await window.energyApi.importFile({ jobId });
      if (!response.ok || !response.data) {
        setResult(null);
        setErrorText(response.error?.message ?? bgText.import.importFailed);
        return;
      }

      setResult(response.data);
      if (response.data.rowCountNormalized === 0) {
        await refreshDatasets();
        setErrorText(null);
        return;
      }

      await setUiState(response.data.datasetId, {
        datasetId: response.data.datasetId,
        fromUtcMs: response.data.detectedFromUtcMs,
        toUtcMs: response.data.detectedToUtcMs,
        interval: "hourly",
      });
      await refreshDatasets(response.data.datasetId);
      navigate("/analysis", {
        state: {
          importStatus: bgText.analysis.importRedirectStatus,
        },
      });
    } catch (error) {
      setResult(null);
      setErrorText(error instanceof Error ? error.message : String(error));
    } finally {
      setIsLoading(false);
      setActiveJobId(null);
    }
  }, [navigate, refreshDatasets, setUiState]);

  const handleCancel = useCallback(async (): Promise<void> => {
    if (!activeJobId) {
      return;
    }

    await window.energyApi.cancelImport({ jobId: activeJobId });
  }, [activeJobId]);

  useEffect(() => {
    const unsubscribe = window.energyApi.onImportProgress((event) => {
      if (activeJobId && event.jobId !== activeJobId) {
        return;
      }
      setProgress(event);
    });

    return unsubscribe;
  }, [activeJobId]);

  useEffect(() => {
    const handler = (): void => {
      void handleImport();
    };

    window.addEventListener(TOPBAR_RUN_EVENT, handler);
    return () => window.removeEventListener(TOPBAR_RUN_EVENT, handler);
  }, [handleImport]);

  return (
    <section className="import-layout">
      <article className="panel panel-primary">
        <div className="panel-header-row">
          <h2 className="panel-title">{bgText.import.title}</h2>
          <div className="action-row">
            <button type="button" className="btn btn-primary" onClick={() => void handleImport()} disabled={isLoading}>
              {isLoading ? bgText.import.loadingButton : bgText.import.chooseFile}
            </button>
            <button type="button" className="btn" onClick={() => void handleCancel()} disabled={!isLoading || !activeJobId}>
              {bgText.import.cancel}
            </button>
          </div>
        </div>
        <div className="status-line">{statusText}</div>
        {result && result.rowCountNormalized === 0 ? (
          <div className="warning-item warning-item-strong">{bgText.import.invalidDetails}</div>
        ) : null}

        <div className="progress-panel">
          <div className="progress-header">
            <span className="summary-label">{bgText.import.progressTitle}</span>
            <span className="summary-value mono">{progress?.progressPercent ?? 0}%</span>
          </div>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${progress?.progressPercent ?? 0}%` }} />
          </div>
          <div className="progress-meta">
            <span>{progress?.message ?? bgText.import.progressIdle}</span>
            {progress?.totalRows ? (
              <span className="mono">
                {bgText.import.progressProcessed}: {progress.processedRows ?? 0} / {progress.totalRows}
              </span>
            ) : null}
          </div>
        </div>

        {result && (
          <div className="import-summary">
            <div className="summary-item">
              <span className="summary-label">{bgText.import.summaryFile}</span>
              <span className="summary-value">{result.fileName}</span>
            </div>
            <div className="summary-item">
              <span className="summary-label">{bgText.import.summaryPath}</span>
              <span className="summary-value">{result.filePath}</span>
            </div>
            <div className="summary-item">
              <span className="summary-label">{bgText.import.summaryImportedRows}</span>
              <span className="summary-value mono">{result.rowCountNormalized}</span>
            </div>
            <div className="summary-item">
              <span className="summary-label">{bgText.import.summaryRawRows}</span>
              <span className="summary-value mono">{result.rowCountRaw}</span>
            </div>
            <div className="summary-item">
              <span className="summary-label">{bgText.import.summaryTimeRange}</span>
              <span className="summary-value">
                {formatTimeRange(result.detectedFromUtcMs, result.detectedToUtcMs)}
              </span>
            </div>
            <div className="summary-item">
              <span className="summary-label">{bgText.import.summaryValidationIssues}</span>
              <span className="summary-value mono">{result.validationIssuesCount}</span>
            </div>
          </div>
        )}
      </article>

      <article className="panel">
        <h2 className="panel-title">{bgText.import.validationTitle}</h2>
        {result && result.validationIssues.length > 0 ? (
          <div className="table-shell">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{bgText.import.validationSeverity}</th>
                  <th>{bgText.import.validationCode}</th>
                  <th>{bgText.import.validationRow}</th>
                  <th>{bgText.import.validationColumn}</th>
                  <th>{bgText.import.validationMessage}</th>
                </tr>
              </thead>
              <tbody>
                {result.validationIssues.map((issue, index) => (
                  <tr key={`${issue.code}-${index}`} className={`table-row-${issue.severity}`}>
                    <td>{issue.severity}</td>
                    <td className="mono">{issue.code}</td>
                    <td className="mono">{issue.rowIndex ?? "-"}</td>
                    <td>{issue.columnName ?? "-"}</td>
                    <td>{issue.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="panel-text">{bgText.import.validationEmpty}</p>
        )}
      </article>
    </section>
  );
}
