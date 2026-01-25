-- Add per-employee break settings (profiles)
ALTER TABLE IF EXISTS public.profiles
  ADD COLUMN IF NOT EXISTS break_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS default_break_minutes integer NOT NULL DEFAULT 0;

-- Add per-entry break minutes (time_entries)
ALTER TABLE IF EXISTS public.time_entries
  ADD COLUMN IF NOT EXISTS break_minutes integer NOT NULL DEFAULT 0;

-- Backfill existing rows defensively
UPDATE public.profiles
SET default_break_minutes = 0
WHERE default_break_minutes IS NULL;

UPDATE public.time_entries
SET break_minutes = 0
WHERE break_minutes IS NULL;
