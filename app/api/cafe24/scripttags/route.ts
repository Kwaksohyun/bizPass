import { NextRequest, NextResponse } from "next/server";
import { ensureValidAccessToken } from "@/lib/api/ensureValidAccessToken";
import { requireMallSession } from "@/lib/api/routeAuth";
import {
  findInstalledBySrc,
  getScriptTagSrc,
  installScriptTag,
  listScriptTags,
  SCRIPT_TAG_DISPLAY_LOCATIONS,
} from "@/lib/cafe24/scripttags";
import { shopsTable } from "@/lib/db";

async function resolveShopNo(mallId: string): Promise<string> {
  const { data } = await shopsTable()
    .select("shop_no")
    .eq("mall_id", mallId)
    .maybeSingle();
  return data?.shop_no ?? "1";
}

/** GET — 우리 앱이 등록한 scripttag 목록 */
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

  const result = await listScriptTags(mall_id!, token);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, status: result.status },
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

  const existing = await listScriptTags(mall_id!, token);
  if (existing.ok) {
    const already = findInstalledBySrc(existing.ours);
    if (already) {
      return NextResponse.json({
        success: true,
        alreadyInstalled: true,
        scripttag: already,
        message: "이미 설치된 scripttag입니다.",
      });
    }
  }

  const shopNo = await resolveShopNo(mall_id!);
  const result = await installScriptTag(mall_id!, token, shopNo);

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, status: result.status },
      { status: result.status ?? 502 },
    );
  }

  return NextResponse.json({
    success: true,
    alreadyInstalled: false,
    scripttag: result.scripttag,
    message: "scripttag 설치가 완료되었습니다.",
  });
}
