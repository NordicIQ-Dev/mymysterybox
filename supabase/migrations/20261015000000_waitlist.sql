-- MyMysteryBox waitlist + giveaway schema
-- Supabase is the source of truth for the list. The email provider only sends.

create extension if not exists pgcrypto;

-- Roles ---------------------------------------------------------------------
do $$ begin
  create type public.app_role as enum ('admin');
exception when duplicate_object then null; end $$;

create table if not exists public.user_roles (
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  primary key (user_id, role)
);

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

-- Giveaways -----------------------------------------------------------------
create table public.giveaways (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null check (slug ~ '^[a-z0-9-]{2,60}$'),
  title text not null,
  prize_name text not null,
  prize_description text,
  prize_value text,
  prize_image_url text,
  winners_count int not null default 1 check (winners_count > 0),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  draw_date timestamptz not null,
  status text not null default 'draft' check (status in ('draft','active','closed','drawn')),
  excluded_countries text[] not null default '{}',
  entries_hash text,            -- SHA-256 of the locked entry list, published when entries close
  entries_locked_at timestamptz,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
-- Only one active giveaway at a time
create unique index one_active_giveaway on public.giveaways ((true)) where status = 'active';

-- Subscribers ---------------------------------------------------------------
create table public.subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null check (email = lower(email) and char_length(email) <= 254),
  first_name text check (char_length(first_name) <= 80),
  country text not null check (country ~ '^[A-Z]{2}$'),
  age_confirmed boolean not null,
  terms_accepted_at timestamptz not null,
  marketing_consent boolean not null default false,
  marketing_consent_at timestamptz,
  consent_text_version text not null,          -- which wording of the form the person agreed to
  confirm_token_hash text,                     -- SHA-256 of the token; the raw token is never stored
  confirm_sent_at timestamptz,
  confirmed_at timestamptz,
  unsubscribed_at timestamptz,
  bounced_at timestamptz,
  complained_at timestamptz,
  esp_synced_at timestamptz,
  giveaway_id uuid references public.giveaways(id),
  utm_source text, utm_medium text, utm_campaign text,
  referrer text, landing_url text,
  ip_hash text,                                -- salted hash, never the raw IP
  user_agent text,
  created_at timestamptz not null default now()
);
create unique index subscribers_email_unique on public.subscribers (email);
create index subscribers_ip_recent on public.subscribers (ip_hash, created_at);
create index subscribers_confirm_token on public.subscribers (confirm_token_hash) where confirm_token_hash is not null;
create index subscribers_giveaway_confirmed on public.subscribers (giveaway_id) where confirmed_at is not null;

-- Every send attempt is logged, so a failed email can never be silent
create table public.email_events (
  id bigint generated always as identity primary key,
  subscriber_id uuid references public.subscribers(id) on delete cascade,
  kind text not null,              -- confirmation | already_in | webhook
  provider text not null,
  mode text not null,              -- sandbox | allowlist | live
  status text not null,            -- sent | skipped | failed | received
  provider_message_id text,
  error text,
  created_at timestamptz not null default now()
);
create index email_events_recent on public.email_events (created_at desc);

-- Draws ---------------------------------------------------------------------
create table public.giveaway_entries (     -- frozen snapshot taken when entries close
  giveaway_id uuid not null references public.giveaways(id),
  subscriber_id uuid not null references public.subscribers(id),
  primary key (giveaway_id, subscriber_id)
);

create table public.giveaway_draws (
  id uuid primary key default gen_random_uuid(),
  giveaway_id uuid not null references public.giveaways(id),
  drawn_at timestamptz not null default now(),
  drawn_by uuid references auth.users(id),
  eligible_count int not null,
  entries_hash text not null,
  winner_subscriber_id uuid not null references public.subscribers(id),
  status text not null default 'pending' check (status in ('pending','accepted','forfeited')),
  notes text
);

create or replace function public.protect_draws() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then raise exception 'Draws cannot be deleted'; end if;
  if new.giveaway_id <> old.giveaway_id or new.drawn_at <> old.drawn_at
     or new.eligible_count <> old.eligible_count or new.entries_hash <> old.entries_hash
     or new.winner_subscriber_id <> old.winner_subscriber_id then
    raise exception 'Only status and notes can change on a draw';
  end if;
  return new;
end $$;
create trigger protect_draws before update or delete on public.giveaway_draws
  for each row execute function public.protect_draws();

create or replace function public.protect_entries() returns trigger language plpgsql as $$
begin raise exception 'The entry snapshot cannot be changed or deleted'; end $$;
create trigger protect_entries before update or delete on public.giveaway_entries
  for each row execute function public.protect_entries();

-- Row level security: anon has NO table access. Edge functions use the service role.
alter table public.user_roles enable row level security;
alter table public.giveaways enable row level security;
alter table public.subscribers enable row level security;
alter table public.email_events enable row level security;
alter table public.giveaway_entries enable row level security;
alter table public.giveaway_draws enable row level security;

create policy "own roles readable" on public.user_roles for select to authenticated using (user_id = auth.uid());
create policy "admin all giveaways" on public.giveaways for all to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));
create policy "admin read subscribers" on public.subscribers for select to authenticated using (public.has_role(auth.uid(), 'admin'));
create policy "admin read email events" on public.email_events for select to authenticated using (public.has_role(auth.uid(), 'admin'));
create policy "admin read entries" on public.giveaway_entries for select to authenticated using (public.has_role(auth.uid(), 'admin'));
create policy "admin read draws" on public.giveaway_draws for select to authenticated using (public.has_role(auth.uid(), 'admin'));
create policy "admin update draws" on public.giveaway_draws for update to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

-- Public, read-only functions for the landing page ---------------------------
create or replace function public.public_giveaway(_slug text default null)
returns table (slug text, title text, prize_name text, prize_description text, prize_value text,
               prize_image_url text, winners_count int, ends_at timestamptz, draw_date timestamptz,
               status text, excluded_countries text[], entries_hash text)
language sql stable security definer set search_path = public as $$
  select g.slug, g.title, g.prize_name, g.prize_description, g.prize_value, g.prize_image_url,
         g.winners_count, g.ends_at, g.draw_date, g.status, g.excluded_countries, g.entries_hash
  from public.giveaways g
  where (_slug is null and g.status = 'active')
     or (_slug is not null and g.slug = _slug and g.status <> 'draft')
  limit 1
$$;

create or replace function public.waitlist_count()
returns bigint language sql stable security definer set search_path = public as $$
  select count(*) from public.subscribers where confirmed_at is not null and unsubscribed_at is null
$$;

create or replace function public.public_draw_log(_slug text)
returns table (drawn_at timestamptz, eligible_count int, entries_hash text, status text)
language sql stable security definer set search_path = public as $$
  select d.drawn_at, d.eligible_count, d.entries_hash, d.status
  from public.giveaway_draws d join public.giveaways g on g.id = d.giveaway_id
  where g.slug = _slug order by d.drawn_at
$$;

revoke all on function public.public_giveaway(text), public.waitlist_count(), public.public_draw_log(text) from public;
grant execute on function public.public_giveaway(text), public.waitlist_count(), public.public_draw_log(text) to anon, authenticated;
