SELECT cron.schedule(
  'send-booking-reminders',
  '* * * * *',
  $$SELECT net.http_post(
    url:='https://project--e0a1e12f-4c6e-45e2-8d94-8da196e9e5d1.lovable.app/api/public/hooks/send-reminders',
    headers:='{"Content-Type": "application/json"}'::jsonb,
    body:='{}'::jsonb
  ) as request_id;$$
);