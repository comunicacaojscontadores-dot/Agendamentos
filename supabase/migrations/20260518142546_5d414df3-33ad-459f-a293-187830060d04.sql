ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS google_calendar_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS google_meet_enabled boolean NOT NULL DEFAULT false;