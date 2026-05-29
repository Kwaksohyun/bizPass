import { NextRequest, NextResponse } from "next/server";
import { ensureValidAccessToken } from "@/lib/api/ensureValidAccessToken";
import { requireMallSession } from "@/lib/api/routeAuth";
import {
  findInstalledBySrc,
  getScriptTagSrc,
  listScriptTags,
  SCRIPT_TAG_DISPLAY_LOCATIONS,
  syncScriptTag,
} from "@/lib/cafe24/scripttags";
import { shopsTable } from "@/lib/db";

async function resolveShopNo(mallId: string): Promise<string> {
  const { data } = await shopsTable()
    .select("shop_no")
    .eq("mall_id", mallId)
    .maybeSingle();
  return data?.shop_no ?? "1";
}

/** GET — scripttag 상태 조회 및 integrity 자동 동기화 */
export async function GET(req: NextRequest) {
  const mall_id = req.nextUrl.searchParams.get("mall_id");
  const authError = await requireMallSession(req, mall_id);
  if (authError) return authError;

  const token = await ensureValidAccessToken(mall_id!);
  if (typeof token !== "string") {
    return NextResponse.json(
      { error: "reinstall_required", message: "토큰 재연동이 필요합니다." },
      { status: 403 },
    );
  }

  const shopNo = await resolveShopNo(mall_id!);
  const syncResult = await syncScriptTag(mall_id!, token, shopNo);

  if (syncResult.ok) {
    return NextResponse.json({
      src: getScriptTagSrc(),
      display_location: SCRIPT_TAG_DISPLAY_LOCATIONS,
      installed: true,
      scripttag: syncResult.scripttag,
      sync_action: syncResult.action,
      message:
        syncResult.action === "updated"
          ? "scripttag integrity가 배포본 기준으로 자동 갱신되었습니다."
          : syncResult.action === "installed"
            ? "scripttag가 자동 설치되었습니다."
            : null,
    });
  }

  const result = await listScriptTags(mall_id!, token);
  if (!result.ok) {
    return NextResponse.json(
      { error: syncResult.error ?? result.error, status: result.status },
      { status: result.status ?? 502 },
    );
  }

  const installed = findInstalledBySrc(result.ours);

  return NextResponse.json({
    src: getScriptTagSrc(),
    display_location: SCRIPT_TAG_DISPLAY_LOCATIONS,
    installed: !!installed,
    scripttag: installed ?? null,
    scripttags: result.ours,
    error: syncResult.error,
  });
}

/** POST — biz-auth-filter.js scripttag 설치 */
export async function POST(req: NextRequest) {
  const mall_id = req.nextUrl.searchParams.get("mall_id");
  const authError = await requireMallSession(req, mall_id);
  if (authError) return authError;

  const token = await ensureValidAccessToken(mall_id!);
  if (typeof token !== "string") {
    return NextResponse.json(
      { error: "reinstall_required", message: "토큰 재연동이 필요합니다." },
      { status: 403 },
    );
  }

  const shopNo = await resolveShopNo(mall_id!);
  const result = await syncScriptTag(mall_id!, token, shopNo);

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, status: result.status },
      { status: result.status ?? 502 },
    );
  }

  return NextResponse.json({
    success: true,
    action: result.action,
    alreadyInstalled: result.action !== "installed",
    scripttag: result.scripttag,
    message:
      result.action === "installed"
        ? "scripttag 설치가 완료되었습니다."
        : result.action === "updated"
          ? "scripttag integrity가 배포본 기준으로 갱신되었습니다."
          : "scripttag가 이미 최신 배포본과 동기화되어 있습니다.",
  });
}
