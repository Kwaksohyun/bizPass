import { NextRequest, NextResponse } from "next/server";

import { linkMemberDocumentsToCafe24Member } from "@/lib/member-documents/uploadMemberDocument";
import { normalizeBizNo } from "@/lib/nts/fetchBusinessStatus";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

/** POST — 업로드 세션의 문서에 카페24 회원 ID 연결 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      upload_session_id?: string;
      mall_id?: string;
      cafe24_member_id?: string;
      biz_no?: string;
    };

    const uploadSessionId = body.upload_session_id?.trim() ?? "";
    const mallId = body.mall_id?.trim() ?? "";
    const cafe24MemberId = body.cafe24_member_id?.trim() ?? "";
    const bizNo = body.biz_no ? normalizeBizNo(body.biz_no) : null;

    if (!uploadSessionId || !mallId || !cafe24MemberId) {
      return NextResponse.json(
        { ok: false, message: "필수 값이 누락되었습니다." },
        { status: 400, headers: corsHeaders },
      );
    }

    const result = await linkMemberDocumentsToCafe24Member({
      uploadSessionId,
      mallId,
      cafe24MemberId,
      bizNo,
    });

    if (!result.ok) {
      return NextResponse.json(
        { ok: false, message: result.message },
        { status: 400, headers: corsHeaders },
      );
    }

    return NextResponse.json(
      {
        ok: true,
        id: result.id,
        business_reg_url: result.business_reg_url,
        bank_copy_url: result.bank_copy_url,
      },
      { status: 200, headers: corsHeaders },
    );
  } catch {
    return NextResponse.json(
      { ok: false, message: "회원 문서 연결 중 오류가 발생했습니다." },
      { status: 500, headers: corsHeaders },
    );
  }
}
