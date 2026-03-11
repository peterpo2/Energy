import { useCallback, useEffect, useState } from "react";
import { useAppState } from "../app/store";
import { TOPBAR_RUN_EVENT } from "../app/events";
import { bgText } from "../app/i18n/bg";

export function SettingsPage(): JSX.Element {
  const { settings, setSettings, reloadSettings } = useAppState();
  const [draft, setDraft] = useState(settings);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setDraft(settings);
  }, [settings]);

  const saveSettings = useCallback(async (): Promise<void> => {
    setIsSaving(true);
    setError(null);
    try {
      await setSettings(draft);
      setStatus(bgText.settings.saveSuccess);
    } catch (nextError) {
      setStatus(null);
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setIsSaving(false);
    }
  }, [draft, setSettings]);

  const restoreSettings = useCallback(async (): Promise<void> => {
    await reloadSettings();
    setStatus(bgText.topBar.refreshDone);
    setError(null);
  }, [reloadSettings]);

  useEffect(() => {
    const runHandler = (): void => {
      void saveSettings();
    };

    window.addEventListener(TOPBAR_RUN_EVENT, runHandler);
    return () => {
      window.removeEventListener(TOPBAR_RUN_EVENT, runHandler);
    };
  }, [saveSettings]);

  return (
    <section className="page-grid">
      <article className="panel panel-primary panel-span-2">
        <div className="panel-header-row">
          <h2 className="panel-title">{bgText.settings.title}</h2>
          <div className="topbar-actions">
            <button type="button" className="btn btn-secondary" onClick={() => void restoreSettings()}>
              {bgText.settings.reload}
            </button>
            <button type="button" className="btn btn-primary" onClick={() => void saveSettings()}>
              {isSaving ? bgText.settings.saving : bgText.settings.save}
            </button>
          </div>
        </div>
        <p className="panel-text">{bgText.settings.text}</p>
        <div className="form-grid">
          <label className="field">
            <span className="field-label">{bgText.settings.timeZone}</span>
            <input
              className="field-input"
              value={draft.analysisTimeZone}
              onChange={(event) => setDraft((prev) => ({ ...prev, analysisTimeZone: event.target.value }))}
            />
          </label>
          <label className="field">
            <span className="field-label">{bgText.settings.sampling}</span>
            <input
              className="field-input"
              type="number"
              min={1}
              value={draft.expectedSamplingMinutes}
              onChange={(event) =>
                setDraft((prev) => ({
                  ...prev,
                  expectedSamplingMinutes: Number(event.target.value) || prev.expectedSamplingMinutes,
                }))
              }
            />
          </label>
          <label className="field">
            <span className="field-label">{bgText.settings.duplicateResolution}</span>
            <select
              className="field-input"
              value={draft.duplicateResolution}
              onChange={(event) =>
                setDraft((prev) => ({
                  ...prev,
                  duplicateResolution: event.target.value as typeof prev.duplicateResolution,
                }))
              }
            >
              <option value="keep_latest">keep_latest</option>
              <option value="keep_first">keep_first</option>
              <option value="average">average</option>
            </select>
          </label>
          <label className="field">
            <span className="field-label">{bgText.settings.minCompleteness}</span>
            <input
              className="field-input"
              type="number"
              min={0}
              max={1}
              step={0.05}
              value={draft.minCompletenessRatio}
              onChange={(event) =>
                setDraft((prev) => ({
                  ...prev,
                  minCompletenessRatio: Number(event.target.value) || prev.minCompletenessRatio,
                }))
              }
            />
          </label>
        </div>
        <div className="status-line">
          {error ? `${bgText.import.errorPrefix}: ${error}` : status ?? bgText.common.savedStateRestored}
        </div>
      </article>
    </section>
  );
}
