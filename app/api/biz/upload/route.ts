import { NextRequest, NextResponse } from "next/server";

import { normalizeBizNo } from "@/lib/nts/fetchBusinessStatus";
import { uploadMemberDocument } from "@/lib/member-documents/uploadMemberDocument";
import {
  DOCUMENT_KEY_REGEX,
  isMemberDocumentType,
} from "@/lib/member-documents/types";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export const runtime = "nodejs";

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

/** POST multipart — 회원가입 첨부파일 → Supabase Storage + member_documents */
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { ok: false, message: "파일이 없습니다." },
        { status: 400, headers: corsHeaders },
      );
    }

    const documentType = String(form.get("document_type") ?? "");
    const uploadSessionId = String(form.get("upload_session_id") ?? "").trim();
    const mallId = String(form.get("mall_id") ?? "").trim();
    const bizNoRaw = String(form.get("biz_no") ?? "");
    const bizNo = bizNoRaw ? normalizeBizNo(bizNoRaw) : null;
    const documentKey = String(form.get("document_key") ?? "").trim();

    if (!isMemberDocumentType(documentType)) {
      return NextResponse.json(
        { ok: false, message: "문서 종류가 올바르지 않습니다." },
        { status: 400, headers: corsHeaders },
      );
    }

    if (!uploadSessionId || uploadSessionId.length < 8) {
      return NextResponse.json(
        { ok: false, message: "업로드 세션 정보가 없습니다." },
        { status: 400, headers: corsHeaders },
      );
    }

    if (!mallId) {
      return NextResponse.json(
        { ok: false, message: "쇼핑몰 정보(mall_id)가 없습니다." },
        { status: 400, headers: corsHeaders },
      );
    }
    if (!documentKey || !DOCUMENT_KEY_REGEX.test(documentKey)) {
      return NextResponse.json(
        { ok: false, message: "문서 키(document_key)가 올바르지 않습니다." },
        { status: 400, headers: corsHeaders },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const mimeType = file.type || "application/octet-stream";

    const result = await uploadMemberDocument({
      file: buffer,
      fileName: file.name || "upload",
      mimeType,
      documentType,
      mallId,
      uploadSessionId,
      bizNo,
      documentKey,
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
        public_url: result.public_url,
        document_type: result.document_type,
        business_reg_url: result.business_reg_url,
        bank_copy_url: result.bank_copy_url,
        business_reg_key: result.business_reg_key,
        bank_copy_key: result.bank_copy_key,
      },
      { status: 200, headers: corsHeaders },
    );
  } catch {
    return NextResponse.json(
      { ok: false, message: "파일 업로드 중 오류가 발생했습니다." },
      { status: 500, headers: corsHeaders },
    );
  }
}
