/** 카페24 OAuth 토큰 응답 (token / refresh 응답 공통) */
export interface Cafe24TokenResponse {
  access_token?: string;
  expires_at?: string;
  refresh_token?: string;
  refresh_token_expires_at?: string;
  client_id?: string;
  mall_id?: string;
  user_id?: string;
  scopes?: string[] | string;
  issued_at?: string;
  shop_no?: string;
  error?: string;
  error_description?: string;
}

export interface TokenRefreshResult {
  success: boolean;
  access_token?: string;
  expires_at?: string;
  error?: string;
}

/** Cafe24 admin/store 응답 일부 */
export interface Cafe24StoreInfo {
  shop_name?: string;
  primary_domain?: string;
  base_domain?: string;
  country?: string;
  country_code?: string;
}

/** {schema}.shops 테이블 행 */
export interface ShopRow {
  mall_id: string;
  access_token: string | null;
  refresh_token: string | null;
  expires_at: string | null;
  refresh_expires_at?: string | null;
  user_id?: string | null;
  shop_no?: string | null;
  scopes?: string | null;
  issued_at?: string | null;
  shop_name?: string | null;
  primary_domain?: string | null;
  base_domain?: string | null;
  country?: string | null;
  country_code?: string | null;
  enabled?: boolean;
  created_at?: string | null;
  updated_at?: string | null;
}
