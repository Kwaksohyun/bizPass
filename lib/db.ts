import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { config } from "@/lib/config/env";

/** 브라우저용 (shops 조회 등) */
export const supabase: SupabaseClient = createClient(
  config.supabase.url || "https://placeholder.supabase.co",
  config.supabase.anonKey || "placeholder-anon-key",
);

/** 서버 전용 — RLS 우회. API Route에서만 사용 */
export const supabaseAdmin: SupabaseClient = createClient(
  config.supabase.url || "https://placeholder.supabase.co",
  config.supabase.serviceRoleKey || "placeholder-service-role-key",
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  },
);

/**
 * Supabase 앱별 분리 스키마 (예: cafe24_init, kment_policy)
 * .env 의 SUPABASE_APP_SCHEMA 로 지정
 */
export const APP_SCHEMA = config.supabase.appSchema;

export function shopsTable(client: SupabaseClient = supabaseAdmin) {
  return client.schema(APP_SCHEMA).from("shops");
}

export function oauthStatesTable(client: SupabaseClient = supabaseAdmin) {
  return client.schema(APP_SCHEMA).from("oauth_states");
}

export function memberDocumentsTable(client: SupabaseClient = supabaseAdmin) {
  return client.schema(APP_SCHEMA).from("member_documents");
}
