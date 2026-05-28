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

-- 회원가입 제출 1건 = 1행 (사업자등록증 URL + 통장사본 URL)
-- 기존 member_documents를 지우고 새로 만들 때 아래 1줄을 먼저 실행하세요.
-- drop table if exists bizPass.member_documents;
create table if not exists bizPass.member_documents (
  id uuid primary key default gen_random_uuid(),
  upload_session_id text not null,
  mall_id text not null,
  biz_no text,
  cafe24_member_id text,
  status text not null default 'pending' check (status in ('pending', 'confirmed')),
  business_reg_storage_path text,
  business_reg_key text,
  business_reg_public_url text,
  business_reg_file_name text,
  business_reg_file_size bigint,
  business_reg_mime_type text,
  bank_copy_storage_path text,
  bank_copy_key text,
  bank_copy_public_url text,
  bank_copy_file_name text,
  bank_copy_file_size bigint,
  bank_copy_mime_type text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (business_reg_key is null and business_reg_public_url is null) or
    (business_reg_key is not null and business_reg_public_url is not null)
  ),
  check (
    (bank_copy_key is null and bank_copy_public_url is null) or
    (bank_copy_key is not null and bank_copy_public_url is not null)
  ),
  unique (upload_session_id, mall_id)
);

create index if not exists member_documents_session_idx
  on bizPass.member_documents (upload_session_id);

create index if not exists member_documents_mall_biz_idx
  on bizPass.member_documents (mall_id, biz_no);

create index if not exists member_documents_member_idx
  on bizPass.member_documents (cafe24_member_id);

create index if not exists member_documents_reg_key_idx
  on bizPass.member_documents (business_reg_key);

create index if not exists member_documents_bank_key_idx
  on bizPass.member_documents (bank_copy_key);

grant all on table bizPass.member_documents to service_role;

alter table bizPass.member_documents enable row level security;

-- Storage (Supabase 대시보드에서 1회 설정)
-- 1) 버킷 이름: bizpass-member-docs
-- 2) Public bucket: ON (공개 다운로드 URL)
-- 3) service_role 로 업로드 (API Route)