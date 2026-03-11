BEGIN;

CREATE TABLE IF NOT EXISTS app_ui_state (
  state_id INTEGER PRIMARY KEY CHECK (state_id = 1),
  active_dataset_id TEXT NULL,
  filters_json TEXT NOT NULL,
  updated_at_utc TEXT NOT NULL,
  FOREIGN KEY(active_dataset_id) REFERENCES datasets(dataset_id) ON DELETE SET NULL
);

INSERT INTO app_ui_state (
  state_id,
  active_dataset_id,
  filters_json,
  updated_at_utc
)
VALUES (
  1,
  NULL,
  '{"datasetId":null,"fromUtcMs":null,"toUtcMs":null,"interval":"hourly"}',
  CURRENT_TIMESTAMP
)
ON CONFLICT(state_id) DO NOTHING;

COMMIT;
