import { NextRequest, NextResponse } from "next/server";
import {
  fetchBusinessStatus,
  normalizeBizNo,
} from "@/lib/nts/fetchBusinessStatus";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

/** POST { "b_no": "1234567890" } — 국세청 사업자 상태(b_stt_cd) 조회 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { b_no?: string };
    const bizNo = normalizeBizNo(body.b_no ?? "");

    if (!bizNo) {
      return NextResponse.json(
        { ok: false, message: "사업자번호 10자리를 입력해 주세요." },
        { status: 400, headers: corsHeaders },
      );
    }

    const result = await fetchBusinessStatus(bizNo);

    return NextResponse.json(
      result.ok
        ? { ok: true, b_stt_cd: result.bSttCd, b_stt: result.bStt }
        : {
            ok: false,
            message: result.message,
            b_stt_cd: result.bSttCd ?? null,
          },
      { status: 200, headers: corsHeaders },
    );
  } catch {
    return NextResponse.json(
      { ok: false, message: "사업자 확인 중 오류가 발생했습니다." },
      { status: 500, headers: corsHeaders },
    );
  }
}
