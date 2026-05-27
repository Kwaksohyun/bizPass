import { shopsTable } from "@/lib/db";
import { config } from "@/lib/config/env";
import { logger } from "@/lib/utils/logger";
import type {
  Cafe24StoreInfo,
  Cafe24TokenResponse,
  ShopRow,
} from "@/types/shop";

function addTimezone(dateStr: string | undefined): string | undefined {
  if (!dateStr) return undefined;
  return dateStr.endsWith("Z") || dateStr.includes("+")
    ? dateStr
    : `${dateStr}+09:00`;
}

function normalizeScopes(scopes: Cafe24TokenResponse["scopes"]): string | null {
  if (!scopes) return null;
  if (Array.isArray(scopes)) return scopes.join(",");
  return String(scopes);
}

/** OAuth 직후 admin/store 조회 (실패해도 토큰 저장은 진행) */
export async function fetchCafe24StoreInfo(
  mallId: string,
  accessToken: string,
  shopNo: string,
): Promise<Cafe24StoreInfo | null> {
  try {
    const url = `https://${mallId}.cafe24api.com/api/v2/admin/store?shop_no=${shopNo}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "X-Cafe24-Api-Version": config.cafe24.apiVersion,
      },
    });

    if (!res.ok) {
      const body = await res.text();
      logger.warn("admin/store 조회 실패 (shops 저장은 계속)", {
        mallId,
        status: res.status,
        body,
      });
      return null;
    }

    const data = await res.json();
    return (data?.store ?? null) as Cafe24StoreInfo | null;
  } catch (error) {
    logger.warn("admin/store 조회 예외 (shops 저장은 계속)", { mallId, error });
    return null;
  }
}

export function buildShopRowFromOAuth(
  token: Cafe24TokenResponse,
  mallId: string,
  storeInfo?: Cafe24StoreInfo | null,
): Omit<ShopRow, "created_at"> & { created_at?: string } {
  const resolvedMallId = token.mall_id || mallId;
  const issuedAt =
    addTimezone(token.issued_at) || new Date().toISOString();

  return {
    mall_id: resolvedMallId,
    access_token: token.access_token ?? null,
    refresh_token: token.refresh_token ?? null,
    expires_at: addTimezone(token.expires_at) ?? null,
    refresh_expires_at: addTimezone(token.refresh_token_expires_at) ?? null,
    user_id: token.user_id ?? null,
    shop_no: token.shop_no || "1",
    scopes: normalizeScopes(token.scopes),
    issued_at: issuedAt,
    shop_name: storeInfo?.shop_name ?? null,
    primary_domain: storeInfo?.primary_domain ?? null,
    base_domain: storeInfo?.base_domain ?? null,
    country: storeInfo?.country ?? null,
    country_code: storeInfo?.country_code ?? null,
    enabled: true,
    created_at: issuedAt,
    updated_at: new Date().toISOString(),
  };
}

/** 앱 설치(OAuth) 완료 시 shops upsert */
export async function saveShopFromOAuth(
  token: Cafe24TokenResponse,
  mallId: string,
): Promise<{ success: true; mall_id: string } | { error: string }> {
  if (!token.access_token) {
    return { error: "access_token이 없습니다." };
  }

  const shopNo = token.shop_no || "1";
  const storeInfo = await fetchCafe24StoreInfo(
    token.mall_id || mallId,
    token.access_token,
    shopNo,
  );

  const shopData = buildShopRowFromOAuth(token, mallId, storeInfo);

  const { error } = await shopsTable().upsert(shopData, {
    onConflict: "mall_id",
  });

  if (error) {
    logger.error("shops upsert 실패", { mallId: shopData.mall_id, error });
    return { error: error.message };
  }

  logger.info("shops 저장 완료", {
    mall_id: shopData.mall_id,
    shop_name: shopData.shop_name,
  });

  return { success: true, mall_id: shopData.mall_id };
}
