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

/** 배포된 JS 기준 integrity(SHA-384)로 scripttag 갱신 */
export async function updateScriptTag(
  mallId: string,
  accessToken: string,
  scriptNo: string,
  shopNo: number | string = 1,
): Promise<
  | { ok: true; scripttag: Cafe24ScriptTag }
  | { ok: false; error: string; status?: number }
> {
  const res = await callCafe24Api<{ scripttag: Cafe24ScriptTag }>({
    mallId,
    endpoint: `admin/scripttags/${scriptNo}`,
    method: "PUT",
    accessToken,
    body: await buildScriptTagPayload(shopNo),
  });

  if (!res.success) {
    return {
      ok: false,
      error: res.error ?? "scripttag 갱신 실패",
      status: res.status,
    };
  }

  if (!res.data?.scripttag) {
    return { ok: false, error: "응답에 scripttag가 없습니다." };
  }

  return { ok: true, scripttag: res.data.scripttag };
}

export async function getCurrentScriptIntegrity(): Promise<string> {
  return getScriptTagIntegrity();
}

export function needsIntegritySync(
  installed: Cafe24ScriptTag | null | undefined,
  currentIntegrity: string,
): boolean {
  if (!installed) return false;
  const registered = installed.integrity;
  if (typeof registered !== "string" || !registered) return true;
  return registered !== currentIntegrity;
}

export async function deleteScriptTag(
  mallId: string,
  accessToken: string,
  scriptNo: string,
): Promise<{ ok: true } | { ok: false; error: string; status?: number }> {
  const res = await callCafe24Api({
    mallId,
    endpoint: `admin/scripttags/${scriptNo}`,
    method: "DELETE",
    accessToken,
  });

  if (!res.success) {
    return {
      ok: false,
      error: res.error ?? "scripttag 삭제 실패",
      status: res.status,
    };
  }

  return { ok: true };
}

/** 설치되어 있으면 integrity 갱신, 없으면 신규 설치 */
export async function syncScriptTag(
  mallId: string,
  accessToken: string,
  shopNo: number | string = 1,
): Promise<
  | {
      ok: true;
      scripttag: Cafe24ScriptTag;
      action: "installed" | "updated" | "unchanged";
    }
  | { ok: false; error: string; status?: number }
> {
  const listed = await listScriptTags(mallId, accessToken);
  if (!listed.ok) {
    return {
      ok: false,
      error: listed.error,
      status: listed.status,
    };
  }

  const installed = findInstalledBySrc(listed.ours);
  if (installed?.script_no) {
    const scriptNo = String(installed.script_no);
    const currentIntegrity = await getCurrentScriptIntegrity();

    if (!needsIntegritySync(installed, currentIntegrity)) {
      return { ok: true, scripttag: installed, action: "unchanged" };
    }

    const updated = await updateScriptTag(
      mallId,
      accessToken,
      scriptNo,
      shopNo,
    );
    if (updated.ok) {
      return { ok: true, scripttag: updated.scripttag, action: "updated" };
    }

    // 앱 삭제·재설치 등으로 script_no가 무효한 경우 삭제 후 재등록
    const removed = await deleteScriptTag(mallId, accessToken, scriptNo);
    if (!removed.ok) return updated;

    const recreated = await installScriptTag(mallId, accessToken, shopNo);
    if (!recreated.ok) return recreated;
    return { ok: true, scripttag: recreated.scripttag, action: "installed" };
  }

  const created = await installScriptTag(mallId, accessToken, shopNo);
  if (!created.ok) return created;
  return { ok: true, scripttag: created.scripttag, action: "installed" };
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
  const result = await syncScriptTag(mallId, accessToken, shopNo);
  if (!result.ok) {
    logger.warn("scripttag 동기화 실패", { mallId, error: result.error });
  }
}
