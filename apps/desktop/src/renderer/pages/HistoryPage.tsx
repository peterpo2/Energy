import { useState } from "react";
import { DatasetListItemDto } from "@shared";
import { useAppState } from "../app/store";
import { bgText } from "../app/i18n/bg";
import { ConfirmDialog } from "../components/common/ConfirmDialog";

interface DeleteIntent {
  dataset: DatasetListItemDto;
  deleteSourceFile: boolean;
}

function formatImportedAt(value: string): string {
  return new Date(value).toLocaleString("bg-BG");
}

function getDatasetStatus(dataset: DatasetListItemDto): string {
  if (dataset.rowCountNormalized <= 0) {
    return bgText.history.statusInvalid;
  }

  if (dataset.rowCountNormalized < dataset.rowCountRaw) {
    return bgText.history.statusPartial;
  }

  return bgText.history.statusReady;
}

export function HistoryPage(): JSX.Element {
  const { datasets, activeDatasetId, refreshDatasets, setUiState, filters } = useAppState();
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingDatasetId, setPendingDatasetId] = useState<string | null>(null);
  const [deleteIntent, setDeleteIntent] = useState<DeleteIntent | null>(null);
  const activeDataset = datasets.find((item) => item.datasetId === activeDatasetId) ?? null;

  const handleActivate = async (dataset: DatasetListItemDto): Promise<void> => {
    setError(null);
    setStatus(null);
    await setUiState(dataset.datasetId, {
      ...filters,
      datasetId: dataset.datasetId,
    });
  };

  const handleDelete = async (dataset: DatasetListItemDto, deleteSourceFile: boolean): Promise<void> => {
    setPendingDatasetId(dataset.datasetId);
    setError(null);
    setStatus(null);

    try {
      const response = await window.energyApi.deleteDataset({
        datasetId: dataset.datasetId,
        deleteSourceFile,
      });

      if (!response.ok || !response.data) {
        throw new Error(response.error?.message ?? bgText.history.deleteFailed);
      }

      const remainingDatasets = datasets.filter((item) => item.datasetId !== dataset.datasetId);
      const nextDatasetId =
        activeDatasetId === dataset.datasetId ? (remainingDatasets[0]?.datasetId ?? null) : activeDatasetId;

      await setUiState(nextDatasetId, {
        ...filters,
        datasetId: nextDatasetId,
      });

      await refreshDatasets(nextDatasetId);
      setStatus(response.data.deletedSourceFile ? bgText.history.deleteFileSuccess : bgText.history.deleteSuccess);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : bgText.history.deleteFailed);
    } finally {
      setPendingDatasetId(null);
      setDeleteIntent(null);
    }
  };

  return (
    <section className="page-grid">
      <article className="panel panel-primary panel-span-2">
        <div className="panel-header-row">
          <h2 className="panel-title">{bgText.history.title}</h2>
          <div className="panel-text">{datasets.length}</div>
        </div>

        {status ? <div className="status-line">{status}</div> : null}
        {error ? <div className="status-line">{`${bgText.import.errorPrefix}: ${error}`}</div> : null}

        {datasets.length === 0 ? (
          <p className="panel-text">{bgText.history.empty}</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{bgText.history.fileColumn}</th>
                  <th>{bgText.history.plantColumn}</th>
                  <th>{bgText.history.sourcePathColumn}</th>
                  <th>{bgText.history.importedAtColumn}</th>
                  <th>{bgText.history.actionColumn}</th>
                </tr>
              </thead>
              <tbody>
                {datasets.map((dataset) => {
                  const isActive = dataset.datasetId === activeDatasetId;
                  const isPending = dataset.datasetId === pendingDatasetId;
                  return (
                    <tr key={dataset.datasetId} className={isActive ? "row-active" : undefined}>
                      <td>
                        <div className="table-primary">{dataset.sourceFileName}</div>
                        <div className="table-secondary">{getDatasetStatus(dataset)}</div>
                      </td>
                      <td>{dataset.plantName ?? "-"}</td>
                      <td className="mono">{dataset.sourceFilePath}</td>
                      <td>{formatImportedAt(dataset.importedAtUtc)}</td>
                      <td>
                        <div className="history-actions">
                          <button
                            type="button"
                            className="btn"
                            disabled={isPending || isActive || dataset.rowCountNormalized <= 0}
                            onClick={() => void handleActivate(dataset)}
                          >
                            {isActive ? bgText.history.active : bgText.history.activate}
                          </button>
                          <button
                            type="button"
                            className="btn"
                            disabled={isPending}
                            onClick={() => setDeleteIntent({ dataset, deleteSourceFile: false })}
                          >
                            {bgText.history.deleteDataset}
                          </button>
                          <button
                            type="button"
                            className="btn btn-danger"
                            disabled={isPending}
                            onClick={() => setDeleteIntent({ dataset, deleteSourceFile: true })}
                          >
                            {bgText.history.deleteFile}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </article>

      <article className="panel">
        <h2 className="panel-title">{bgText.common.status}</h2>
        <p className="panel-text">
          {activeDataset
            ? getDatasetStatus(activeDataset)
            : bgText.common.noActiveDataset}
        </p>
        <div className="summary-item">
          <span className="summary-label">{bgText.topBar.activeDataset}</span>
          <span className="summary-value">{activeDataset?.sourceFileName ?? "-"}</span>
        </div>
      </article>

      <ConfirmDialog
        open={deleteIntent !== null}
        title={deleteIntent?.deleteSourceFile ? bgText.history.deleteFile : bgText.history.deleteDataset}
        message={deleteIntent?.deleteSourceFile ? bgText.history.deleteConfirmFile : bgText.history.deleteConfirmDataset}
        confirmLabel={deleteIntent?.deleteSourceFile ? bgText.history.deleteFile : bgText.history.deleteDataset}
        cancelLabel={bgText.common.cancel}
        destructive
        onCancel={() => {
          setDeleteIntent(null);
          setPendingDatasetId(null);
        }}
        onConfirm={() => {
          if (deleteIntent) {
            void handleDelete(deleteIntent.dataset, deleteIntent.deleteSourceFile);
          }
        }}
      />
    </section>
  );
}
