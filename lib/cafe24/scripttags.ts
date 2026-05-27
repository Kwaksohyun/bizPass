import crypto from "crypto";
import { readFile } from "fs/promises";
import path from "path";

import { callCafe24Api } from "@/lib/api/cafe24Api";
import { config } from "@/lib/config/env";
import {
  filterOurScriptTags,
  type Cafe24ScriptTag,
} from "@/lib/utils/scriptTag";
import { logger } from "@/lib/utils/logger";

export const SCRIPT_TAG_FILENAME = "biz-auth-filter.js";

export const SCRIPT_TAG_DISPLAY_LOCATIONS = ["MEMBER_JOIN"] as const;

export function getScriptTagSrc(): string {
  const base = config.app.url.replace(/\/$/, "");
  return `${base}/${SCRIPT_TAG_FILENAME}`;
}

async function getScriptTagIntegrity(): Promise<string> {
  const scriptBuf = await readFile(
    path.join(process.cwd(), "public", SCRIPT_TAG_FILENAME),
  );
  return `sha384-${crypto.createHash("sha384").update(scriptBuf).digest("base64")}`;
}

export async function buildScriptTagPayload(shopNo: number | string = 1) {
  return {
    shop_no: Number(shopNo) || 1,
    request: {
      src: getScriptTagSrc(),
      display_location: [...SCRIPT_TAG_DISPLAY_LOCATIONS],
      integrity: await getScriptTagIntegrity(),
    },
  };
}

export async function listScriptTags(
  mallId: string,
  accessToken: string,
): Promise<
  | { ok: true; ours: Cafe24ScriptTag[] }
  | { ok: false; error: string; status?: number }
> {
  const res = await callCafe24Api<{ scripttags: Cafe24ScriptTag[] }>({
    mallId,
    endpoint: "admin/scripttags",
    accessToken,
  });

  if (!res.success) {
    return {
      ok: false,
      error: res.error ?? "scripttags 조회 실패",
      status: res.status,
    };
  }

  const all = res.data?.scripttags ?? [];
  return { ok: true, ours: filterOurScriptTags(all) };
}

export async function installScriptTag(
  mallId: string,
  accessToken: string,
  shopNo: number | string = 1,
): Promise<
  | { ok: true; scripttag: Cafe24ScriptTag }
  | { ok: false; error: string; status?: number }
> {
  const res = await callCafe24Api<{ scripttag: Cafe24ScriptTag }>({
    mallId,
    endpoint: "admin/scripttags",
    method: "POST",
    accessToken,
    body: await buildScriptTagPayload(shopNo),
  });

  if (!res.success) {
    return {
      ok: false,
      error: res.error ?? "scripttag 설치 실패",
      status: res.status,
    };
  }

  if (!res.data?.scripttag) {
    return { ok: false, error: "응답에 scripttag가 없습니다." };
  }

  return { ok: true, scripttag: res.data.scripttag };
}

export function findInstalledBySrc(
  tags: Cafe24ScriptTag[],
  src = getScriptTagSrc(),
): Cafe24ScriptTag | undefined {
  return tags.find((t) => t.src === src);
}

/** OAuth 콜백 등 서버 내부용 — 세션 없이 중복 설치 방지 */
export async function ensureScriptTagInstalled(
  mallId: string,
  accessToken: string,
  shopNo: string = "1",
): Promise<void> {
  const existing = await listScriptTags(mallId, accessToken);
  if (existing.ok && findInstalledBySrc(existing.ours)) return;

  const result = await installScriptTag(mallId, accessToken, shopNo);
  if (!result.ok) {
    logger.warn("scripttag 설치 실패", { mallId, error: result.error });
  }
}
