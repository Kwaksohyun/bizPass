import { NextRequest, NextResponse } from "next/server";

import { memberDocumentsTable } from "@/lib/db";
import { normalizeBizNo } from "@/lib/nts/fetchBusinessStatus";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

/** POST — 사업자 확인 후 세션 문서에 biz_no 반영 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      upload_session_id?: string;
      mall_id?: string;
      biz_no?: string;
    };

    const uploadSessionId = body.upload_session_id?.trim() ?? "";
    const mallId = body.mall_id?.trim() ?? "";
    const bizNo = normalizeBizNo(body.biz_no ?? "");

    if (!uploadSessionId || !mallId || !bizNo) {
      return NextResponse.json(
        { ok: false, message: "필수 값이 누락되었습니다." },
        { status: 400, headers: corsHeaders },
      );
    }

    const { data, error } = await memberDocumentsTable()
      .update({
        biz_no: bizNo,
        updated_at: new Date().toISOString(),
      })
      .eq("upload_session_id", uploadSessionId)
      .eq("mall_id", mallId)
      .select("id, business_reg_public_url, bank_copy_public_url")
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { ok: false, message: "사업자번호 연결에 실패했습니다." },
        { status: 500, headers: corsHeaders },
      );
    }

    if (!data) {
      return NextResponse.json(
        { ok: false, message: "연결할 제출 문서를 찾을 수 없습니다." },
        { status: 404, headers: corsHeaders },
      );
    }

    return NextResponse.json(
      {
        ok: true,
        id: data.id,
        business_reg_url: data.business_reg_public_url,
        bank_copy_url: data.bank_copy_public_url,
      },
      { status: 200, headers: corsHeaders },
    );
  } catch {
    return NextResponse.json(
      { ok: false, message: "사업자번호 연결 중 오류가 발생했습니다." },
      { status: 500, headers: corsHeaders },
    );
  }
}
