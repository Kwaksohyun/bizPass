-- Supabase SQL Editor에서 한 번 실행
-- 다른 앱과 DB를 나누려면 스키마 이름만 바꾸고, .env 의 SUPABASE_APP_SCHEMA 와 동일하게 맞추세요.

create schema if not exists bizPass;

create table if not exists bizPass.oauth_states (
  state text primary key,
  mall_id text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists bizPass.shops (
  mall_id text primary key,
  access_token text,
  refresh_token text,
  expires_at timestamptz,
  refresh_expires_at timestamptz,
  user_id text,
  shop_no text,
  scopes text,
  issued_at timestamptz,
  shop_name text,
  primary_domain text,
  base_domain text,
  country text,
  country_code text,
  enabled boolean default true,
  created_at timestamptz,
  updated_at timestamptz
);

grant usage on schema bizPass to anon, authenticated, service_role;
grant select on table bizPass.shops to anon, authenticated;
grant all on table bizPass.shops to service_role;
grant all on table bizPass.oauth_states to service_role;

alter table bizPass.oauth_states enable row level security;
alter table bizPass.shops enable row level security;

-- 클라이언트 getShopByMallId(anon)용 — 운영 시 mall 단위로 좁히는 것을 권장
create policy "shops_select_anon"
  on bizPass
.shops
  for select
  to anon
  using (true);