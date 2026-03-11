BEGIN;

CREATE INDEX IF NOT EXISTS idx_datasets_imported_at ON datasets(imported_at_utc DESC);
CREATE INDEX IF NOT EXISTS idx_datasets_hash ON datasets(source_file_hash);
CREATE INDEX IF NOT EXISTS idx_datasets_plant ON datasets(plant_name);

CREATE INDEX IF NOT EXISTS idx_measurements_dataset_ts ON measurements(dataset_id, timestamp_utc_ms);
CREATE INDEX IF NOT EXISTS idx_measurements_ts ON measurements(timestamp_utc_ms);

CREATE INDEX IF NOT EXISTS idx_agg_hourly_dataset_start ON aggregate_hourly(dataset_id, bucket_start_utc_ms);
CREATE INDEX IF NOT EXISTS idx_agg_daily_dataset_start ON aggregate_daily(dataset_id, bucket_start_utc_ms);
CREATE INDEX IF NOT EXISTS idx_agg_monthly_dataset_start ON aggregate_monthly(dataset_id, bucket_start_utc_ms);
CREATE INDEX IF NOT EXISTS idx_agg_monthly_year_month ON aggregate_monthly(year_month);

CREATE INDEX IF NOT EXISTS idx_night_analysis_dataset_month
  ON night_window_analyses(dataset_id, month_key);
CREATE INDEX IF NOT EXISTS idx_night_candidates_lookup
  ON night_window_candidates(dataset_id, month_key, duration_hours, rank);

COMMIT;

