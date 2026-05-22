ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS notify_email_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notification_email text;