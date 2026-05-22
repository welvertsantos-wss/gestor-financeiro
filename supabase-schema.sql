-- Gestor Financeiro Cloud
-- Cole este SQL no Supabase em: SQL Editor -> New query -> Run.
-- Ele cria uma camada segura por usuário para salvar o estado do aplicativo.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  company_name text not null default 'Gestor Financeiro',
  whatsapp_phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles
add column if not exists whatsapp_phone text;

create index if not exists profiles_whatsapp_phone_idx
on public.profiles (whatsapp_phone);

create table if not exists public.app_states (
  user_id uuid primary key references auth.users(id) on delete cascade,
  company_name text not null default 'Gestor Financeiro',
  state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  phone text,
  direction text not null check (direction in ('inbound', 'outbound')),
  body text not null,
  parsed_payload jsonb,
  status text not null default 'received',
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.app_states enable row level security;
alter table public.whatsapp_messages enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;

create policy "profiles_select_own"
on public.profiles for select
using (auth.uid() = user_id);

create policy "profiles_insert_own"
on public.profiles for insert
with check (auth.uid() = user_id);

create policy "profiles_update_own"
on public.profiles for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "app_states_select_own" on public.app_states;
drop policy if exists "app_states_insert_own" on public.app_states;
drop policy if exists "app_states_update_own" on public.app_states;
drop policy if exists "app_states_delete_own" on public.app_states;

create policy "app_states_select_own"
on public.app_states for select
using (auth.uid() = user_id);

create policy "app_states_insert_own"
on public.app_states for insert
with check (auth.uid() = user_id);

create policy "app_states_update_own"
on public.app_states for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "app_states_delete_own"
on public.app_states for delete
using (auth.uid() = user_id);

drop policy if exists "whatsapp_messages_select_own" on public.whatsapp_messages;
drop policy if exists "whatsapp_messages_insert_own" on public.whatsapp_messages;
drop policy if exists "whatsapp_messages_update_own" on public.whatsapp_messages;

create policy "whatsapp_messages_select_own"
on public.whatsapp_messages for select
using (auth.uid() = user_id);

create policy "whatsapp_messages_insert_own"
on public.whatsapp_messages for insert
with check (auth.uid() = user_id);

create policy "whatsapp_messages_update_own"
on public.whatsapp_messages for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
