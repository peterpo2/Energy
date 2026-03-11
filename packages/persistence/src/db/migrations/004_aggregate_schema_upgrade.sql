BEGIN;

-- Existing installed databases may have been created before the aggregate
-- tables were normalized to a shared column set used by AggregateRepository.
-- Add the missing columns so older DB files can be upgraded in place.

ALTER TABLE aggregate_hourly ADD COLUMN year_month TEXT NULL;

ALTER TABLE aggregate_daily ADD COLUMN hour_of_day INTEGER NULL;
ALTER TABLE aggregate_daily ADD COLUMN year_month TEXT NULL;

ALTER TABLE aggregate_monthly ADD COLUMN local_date TEXT NULL;
ALTER TABLE aggregate_monthly ADD COLUMN hour_of_day INTEGER NULL;

COMMIT;
