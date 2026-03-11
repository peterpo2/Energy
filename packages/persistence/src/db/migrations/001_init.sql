BEGIN;

CREATE TABLE IF NOT EXISTS datasets (
  dataset_id TEXT PRIMARY KEY,
  source_file_path TEXT NOT NULL,
  source_file_name TEXT NOT NULL,
  source_file_hash TEXT NOT NULL,
  selected_worksheet_name TEXT NOT NULL,
  selected_worksheet_index INTEGER NOT NULL,
  plant_name TEXT NULL,
  detected_time_zone TEXT NULL,
  imported_at_utc TEXT NOT NULL,
  first_timestamp_utc_ms INTEGER NULL,
  last_timestamp_utc_ms INTEGER NULL,
  row_count_raw INTEGER NOT NULL,
  row_count_normalized INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS measurements (
  id TEXT PRIMARY KEY,
  dataset_id TEXT NOT NULL,
  timestamp_utc_ms INTEGER NOT NULL,
  timestamp_iso_utc TEXT NOT NULL,
  plant_name TEXT NULL,
  source_time_zone TEXT NULL,
  source_row_index INTEGER NOT NULL,
  production_w REAL NULL,
  consumption_w REAL NULL,
  grid_w REAL NULL,
  purchasing_w REAL NULL,
  feed_in_w REAL NULL,
  quality_flags_json TEXT NOT NULL,
  FOREIGN KEY(dataset_id) REFERENCES datasets(dataset_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS aggregate_hourly (
  dataset_id TEXT NOT NULL,
  bucket_key TEXT NOT NULL,
  bucket_start_utc_ms INTEGER NOT NULL,
  local_date TEXT NOT NULL,
  hour_of_day INTEGER NOT NULL,
  metrics_json TEXT NOT NULL,
  expected_samples INTEGER NOT NULL,
  unique_timestamp_count INTEGER NOT NULL,
  completeness_ratio REAL NOT NULL,
  duplicate_count INTEGER NOT NULL,
  gap_count INTEGER NOT NULL,
  metadata_json TEXT NULL,
  PRIMARY KEY(dataset_id, bucket_key),
  FOREIGN KEY(dataset_id) REFERENCES datasets(dataset_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS aggregate_daily (
  dataset_id TEXT NOT NULL,
  bucket_key TEXT NOT NULL,
  bucket_start_utc_ms INTEGER NOT NULL,
  local_date TEXT NOT NULL,
  metrics_json TEXT NOT NULL,
  expected_samples INTEGER NOT NULL,
  unique_timestamp_count INTEGER NOT NULL,
  completeness_ratio REAL NOT NULL,
  duplicate_count INTEGER NOT NULL,
  gap_count INTEGER NOT NULL,
  metadata_json TEXT NULL,
  PRIMARY KEY(dataset_id, bucket_key),
  FOREIGN KEY(dataset_id) REFERENCES datasets(dataset_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS aggregate_monthly (
  dataset_id TEXT NOT NULL,
  bucket_key TEXT NOT NULL,
  bucket_start_utc_ms INTEGER NOT NULL,
  year_month TEXT NOT NULL,
  metrics_json TEXT NOT NULL,
  expected_samples INTEGER NOT NULL,
  unique_timestamp_count INTEGER NOT NULL,
  completeness_ratio REAL NOT NULL,
  duplicate_count INTEGER NOT NULL,
  gap_count INTEGER NOT NULL,
  metadata_json TEXT NULL,
  PRIMARY KEY(dataset_id, bucket_key),
  FOREIGN KEY(dataset_id) REFERENCES datasets(dataset_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS night_window_analyses (
  analysis_id TEXT PRIMARY KEY,
  dataset_id TEXT NOT NULL,
  month_key TEXT NOT NULL,
  night_start_local_time TEXT NOT NULL,
  night_end_local_time TEXT NOT NULL,
  available_days INTEGER NOT NULL,
  analyzed_hours INTEGER NOT NULL,
  hour_ranking_json TEXT NOT NULL,
  best_1h_window_json TEXT NULL,
  best_2h_window_json TEXT NULL,
  best_3h_window_json TEXT NULL,
  best_4h_window_json TEXT NULL,
  top_3_overall_json TEXT NOT NULL,
  warnings_json TEXT NOT NULL,
  created_at_utc TEXT NOT NULL,
  updated_at_utc TEXT NOT NULL,
  UNIQUE(dataset_id, month_key, night_start_local_time, night_end_local_time),
  FOREIGN KEY(dataset_id) REFERENCES datasets(dataset_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS night_window_candidates (
  analysis_id TEXT NOT NULL,
  dataset_id TEXT NOT NULL,
  month_key TEXT NOT NULL,
  duration_hours INTEGER NOT NULL,
  rank INTEGER NOT NULL,
  start_hour_of_day INTEGER NOT NULL,
  end_hour_of_day INTEGER NOT NULL,
  start_local_time TEXT NOT NULL,
  end_local_time TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL,
  days_considered INTEGER NOT NULL,
  days_with_data INTEGER NOT NULL,
  average_consumption_w REAL NULL,
  total_estimated_consumption_wh REAL NOT NULL,
  min_consumption_w REAL NULL,
  max_consumption_w REAL NULL,
  variance_consumption_w REAL NULL,
  std_dev_consumption_w REAL NULL,
  stability_score REAL NOT NULL,
  completeness_ratio REAL NOT NULL,
  duplicate_impact REAL NOT NULL,
  gap_impact REAL NOT NULL,
  final_recommendation_score REAL NOT NULL,
  PRIMARY KEY(analysis_id, duration_hours, rank),
  FOREIGN KEY(analysis_id) REFERENCES night_window_analyses(analysis_id) ON DELETE CASCADE,
  FOREIGN KEY(dataset_id) REFERENCES datasets(dataset_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS app_settings (
  settings_id INTEGER PRIMARY KEY CHECK (settings_id = 1),
  analysis_time_zone TEXT NOT NULL,
  expected_sampling_minutes INTEGER NOT NULL,
  duplicate_resolution TEXT NOT NULL CHECK (duplicate_resolution IN ('keep_latest', 'keep_first', 'average')),
  default_night_start TEXT NOT NULL,
  default_night_end TEXT NOT NULL,
  min_completeness_ratio REAL NOT NULL,
  min_days_required_for_recommendation INTEGER NOT NULL,
  max_safe_delta_minutes INTEGER NOT NULL,
  updated_at_utc TEXT NOT NULL
);

INSERT INTO app_settings (
  settings_id,
  analysis_time_zone,
  expected_sampling_minutes,
  duplicate_resolution,
  default_night_start,
  default_night_end,
  min_completeness_ratio,
  min_days_required_for_recommendation,
  max_safe_delta_minutes,
  updated_at_utc
)
VALUES (
  1,
  'UTC',
  5,
  'keep_latest',
  '22:00',
  '07:00',
  0.80,
  5,
  180,
  CURRENT_TIMESTAMP
)
ON CONFLICT(settings_id) DO NOTHING;

COMMIT;

