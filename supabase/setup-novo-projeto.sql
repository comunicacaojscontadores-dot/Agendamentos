-- =============================================================================
-- SETUP COMPLETO DO BANCO — Sistema de Agendamento de Salas (JS Contadores)
-- =============================================================================
-- Use este arquivo para recriar o banco em um PROJETO SUPABASE NOVO, depois
-- que o projeto antigo foi excluído.
--
-- COMO USAR:
--   1. Crie o projeto novo no Supabase (pode ser no mesmo login do "estoque").
--   2. Abra:  SQL Editor  ->  New query
--   3. Cole TODO este arquivo e clique em "Run".
--   4. Leia a SEÇÃO 7 (cron) com atenção — você PRECISA trocar a URL lá.
--
-- Este arquivo consolida as 5 migrations originais em um só lugar, já com as
-- colunas extras dobradas dentro das tabelas. Resultado final é idêntico ao
-- banco antigo, com UMA correção importante: a URL do lembrete (cron) agora
-- aponta para o Cloudflare, e não mais para a URL morta do Lovable.
-- =============================================================================


-- =============================================================================
-- SEÇÃO 1 — Extensões base
-- =============================================================================
create extension if not exists btree_gist;


-- =============================================================================
-- SEÇÃO 2 — Papéis de usuário (admin) + função has_role
-- =============================================================================
create type public.app_role as enum ('admin');

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create policy "users can view own roles" on public.user_roles
for select to authenticated using (user_id = auth.uid());

create policy "admins manage roles" on public.user_roles
for all to authenticated using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));


-- =============================================================================
-- SEÇÃO 3 — Salas (rooms)
-- Inclui as colunas que originalmente vinham em migrations separadas:
--   notify_email_enabled, notification_email  (migration 20260515)
--   google_calendar_enabled, google_meet_enabled  (migration 20260518)
-- =============================================================================
create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  room_number text not null,
  name text,
  location text not null,
  video_call boolean not null default false,
  available_durations integer[] not null default '{15,30,45,60,90,120}',
  active boolean not null default true,
  notify_email_enabled boolean not null default false,
  notification_email text,
  google_calendar_enabled boolean not null default false,
  google_meet_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.rooms enable row level security;

create policy "anyone can view active rooms" on public.rooms for select using (true);
create policy "admins manage rooms" on public.rooms
for all to authenticated using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));


-- =============================================================================
-- SEÇÃO 4 — Disponibilidade das salas (room_availability)
-- =============================================================================
create table public.room_availability (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  start_time time not null,
  end_time time not null check (end_time > start_time),
  created_at timestamptz not null default now()
);

alter table public.room_availability enable row level security;

create policy "anyone can view availability" on public.room_availability for select using (true);
create policy "admins manage availability" on public.room_availability
for all to authenticated using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));

create index room_availability_room_idx on public.room_availability(room_id, day_of_week);


-- =============================================================================
-- SEÇÃO 5 — Agendamentos (bookings)
-- A constraint bookings_no_overlap impede duas reservas ativas na mesma sala
-- com horários que se sobrepõem (usa a extensão btree_gist da Seção 1).
-- =============================================================================
create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_name text not null,
  user_email text not null,
  guest_emails text[] not null default '{}',
  notes text,
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at),
  status text not null default 'active' check (status in ('active','cancelled')),
  cancel_token uuid not null default gen_random_uuid() unique,
  reminder_sent boolean not null default false,
  created_at timestamptz not null default now(),
  cancelled_at timestamptz
);

alter table public.bookings enable row level security;

alter table public.bookings
  add constraint bookings_no_overlap
  exclude using gist (
    room_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status = 'active');

create index bookings_room_starts_idx on public.bookings(room_id, starts_at);
create index bookings_starts_active_idx on public.bookings(starts_at) where status = 'active';

create policy "anyone can create bookings" on public.bookings
for insert to anon, authenticated with check (true);

create policy "admins view all bookings" on public.bookings
for select to authenticated using (public.has_role(auth.uid(), 'admin'));

create policy "admins update bookings" on public.bookings
for update to authenticated using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));

create policy "admins delete bookings" on public.bookings
for delete to authenticated using (public.has_role(auth.uid(), 'admin'));


-- =============================================================================
-- SEÇÃO 6 — Funções de apoio + trigger que cria o PRIMEIRO admin
-- =============================================================================
create or replace function public.get_booked_slots(_room_id uuid, _date date)
returns table (starts_at timestamptz, ends_at timestamptz)
language sql stable security definer set search_path = public as $$
  select b.starts_at, b.ends_at
  from public.bookings b
  where b.room_id = _room_id and b.status = 'active' and b.starts_at::date = _date;
$$;

grant execute on function public.get_booked_slots(uuid, date) to anon, authenticated;

create or replace function public.get_booking_by_token(_token uuid)
returns table (id uuid, room_name text, room_number text, starts_at timestamptz, ends_at timestamptz, user_name text, status text)
language sql stable security definer set search_path = public as $$
  select b.id, r.name, r.room_number, b.starts_at, b.ends_at, b.user_name, b.status
  from public.bookings b join public.rooms r on r.id = b.room_id
  where b.cancel_token = _token limit 1;
$$;

grant execute on function public.get_booking_by_token(uuid) to anon, authenticated;

create or replace function public.cancel_booking_by_token(_token uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare _updated int;
begin
  update public.bookings set status = 'cancelled', cancelled_at = now()
    where cancel_token = _token and status = 'active';
  get diagnostics _updated = row_count;
  return _updated > 0;
end;
$$;

grant execute on function public.cancel_booking_by_token(uuid) to anon, authenticated;

-- IMPORTANTE: o PRIMEIRO usuário que se cadastrar/logar no projeto novo vira
-- admin automaticamente por causa deste trigger. Garanta que o primeiro login
-- seja o SEU.
create or replace function public.bootstrap_first_admin()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.user_roles where role = 'admin') then
    insert into public.user_roles (user_id, role) values (new.id, 'admin');
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_bootstrap_admin on auth.users;
create trigger on_auth_user_created_bootstrap_admin
after insert on auth.users for each row execute function public.bootstrap_first_admin();


-- =============================================================================
-- SEÇÃO 7 — Lembrete automático (pg_cron)  *** LEIA ANTES DE RODAR ***
-- =============================================================================
-- Esta seção agenda um job que, a cada minuto, chama o endpoint do site que
-- envia os e-mails de lembrete (15 min antes da reunião).
--
-- A URL abaixo já está preenchida com o seu Worker, confirmado no painel
-- do Cloudflare: agendamentosjs.comunicacaojscontadores.workers.dev
-- (Se um dia mudar o domínio do Worker, é aqui que você troca.)
--
-- (No banco antigo isto apontava para a URL do Lovable, que não existe mais —
--  por isso os lembretes tinham parado de ser enviados.)
--
-- OBS.: se a linha "create extension ... pg_cron" der erro, habilite primeiro
-- as extensões pg_cron e pg_net pelo painel:
--   Database -> Extensions -> ative "pg_cron" e "pg_net" -> depois rode só o
--   bloco do cron.schedule abaixo.
-- =============================================================================
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'send-booking-reminders',
  '* * * * *',
  $$select net.http_post(
    url:='https://agendamentosjs.comunicacaojscontadores.workers.dev/api/public/hooks/send-reminders',
    headers:='{"Content-Type": "application/json"}'::jsonb,
    body:='{}'::jsonb
  ) as request_id;$$
);

-- Para conferir depois que rodar:
--   select * from cron.job;            -- deve listar 'send-booking-reminders'
--   select * from cron.job_run_details order by start_time desc limit 10;
-- =============================================================================
-- FIM
-- =============================================================================
