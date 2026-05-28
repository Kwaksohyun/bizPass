import { config } from "@/lib/config/env";
import { memberDocumentsTable, supabaseAdmin } from "@/lib/db";
import {
  ALLOWED_MIME_TYPES,
  MAX_UPLOAD_BYTES,
  type MemberDocumentType,
} from "@/lib/member-documents/types";

export type UploadMemberDocumentInput = {
  file: Buffer;
  fileName: string;
  mimeType: string;
  documentType: MemberDocumentType;
  mallId: string;
  uploadSessionId: string;
  bizNo?: string | null;
  documentKey: string;
};

export type MemberDocumentRow = {
  id: string;
  business_reg_public_url: string | null;
  bank_copy_public_url: string | null;
};

export type UploadMemberDocumentResult =
  | {
      ok: true;
      id: string;
      public_url: string;
      document_type: MemberDocumentType;
      business_reg_url: string | null;
      bank_copy_url: string | null;
      business_reg_key: string | null;
      bank_copy_key: string | null;
    }
  | { ok: false; message: string };

const FIELD_BY_TYPE = {
  business_reg: {
    storage_path: "business_reg_storage_path",
    public_url: "business_reg_public_url",
    file_name: "business_reg_file_name",
    file_size: "business_reg_file_size",
    mime_type: "business_reg_mime_type",
    key: "business_reg_key",
  },
  bank_copy: {
    storage_path: "bank_copy_storage_path",
    public_url: "bank_copy_public_url",
    file_name: "bank_copy_file_name",
    file_size: "bank_copy_file_size",
    mime_type: "bank_copy_mime_type",
    key: "bank_copy_key",
  },
} as const;

function sanitizePathSegment(value: string, maxLen = 80): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, maxLen);
}

function getExtension(fileName: string, mimeType: string): string {
  const fromName = fileName.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase();
  if (fromName) return fromName;
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/gif") return "gif";
  if (mimeType === "image/webp") return "webp";
  return "bin";
}

async function ensurePublicBucket(bucket: string): Promise<string | null> {
  const { data: buckets, error } = await supabaseAdmin.storage.listBuckets();
  if (error) {
    return `Storage 버킷 목록 조회 실패: ${error.message}`;
  }

  const exists = buckets?.some((b) => b.name === bucket);
  if (exists) return null;

  const { error: createError } = await supabaseAdmin.storage.createBucket(bucket, {
    public: true,
    fileSizeLimit: MAX_UPLOAD_BYTES,
    allowedMimeTypes: [...ALLOWED_MIME_TYPES],
  });

  if (createError) {
    return `Storage 버킷 생성 실패: ${createError.message}`;
  }

  return null;
}

async function removeStoragePath(path: string | null | undefined) {
  if (!path) return;
  const bucket = config.storage.memberDocsBucket;
  await supabaseAdmin.storage.from(bucket).remove([path]);
}

export async function uploadMemberDocument(
  input: UploadMemberDocumentInput,
): Promise<UploadMemberDocumentResult> {
  const {
    file,
    fileName,
    mimeType,
    documentType,
    mallId,
    uploadSessionId,
    bizNo,
    documentKey,
  } =
    input;

  if (!file.length) {
    return { ok: false, message: "빈 파일은 업로드할 수 없습니다." };
  }
  if (file.length > MAX_UPLOAD_BYTES) {
    return { ok: false, message: "파일 크기는 10MB 이하여야 합니다." };
  }
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    return {
      ok: false,
      message: "PDF 또는 이미지 파일만 업로드할 수 있습니다.",
    };
  }

  const bucket = config.storage.memberDocsBucket;
  const bucketError = await ensurePublicBucket(bucket);
  if (bucketError) {
    return { ok: false, message: bucketError };
  }

  const fields = FIELD_BY_TYPE[documentType];
  const safeMall = sanitizePathSegment(mallId);
  const safeSession = sanitizePathSegment(uploadSessionId);
  const ext = getExtension(fileName, mimeType);
  const storagePath = `${safeMall}/${safeSession}/${documentType}_${Date.now()}.${ext}`;

  const { error: uploadError } = await supabaseAdmin.storage
    .from(bucket)
    .upload(storagePath, file, {
      contentType: mimeType,
      upsert: false,
      cacheControl: "31536000",
    });

  if (uploadError) {
    return { ok: false, message: `파일 업로드 실패: ${uploadError.message}` };
  }

  const publicUrl = supabaseAdmin.storage.from(bucket).getPublicUrl(storagePath)
    .data.publicUrl;
  const now = new Date().toISOString();

  const { data: existing } = await memberDocumentsTable()
    .select(
      "id, business_reg_storage_path, bank_copy_storage_path, business_reg_key, bank_copy_key",
    )
    .eq("upload_session_id", uploadSessionId)
    .eq("mall_id", mallId)
    .maybeSingle();

  const patch: Record<string, string | number | null> = {
    mall_id: mallId,
    biz_no: bizNo ?? null,
    updated_at: now,
    [fields.storage_path]: storagePath,
    [fields.public_url]: publicUrl,
    [fields.file_name]: fileName,
    [fields.file_size]: file.length,
    [fields.mime_type]: mimeType,
    [fields.key]: documentKey,
  };

  const upsertRow: Record<string, string | number | null> = {
    upload_session_id: uploadSessionId,
    mall_id: mallId,
    biz_no: bizNo ?? null,
    status: "pending",
    ...patch,
  };

  const { data: saved, error: saveError } = await memberDocumentsTable()
    .upsert(upsertRow, { onConflict: "upload_session_id,mall_id" })
    .select(
      "id, business_reg_public_url, bank_copy_public_url, business_reg_key, bank_copy_key",
    )
    .single();

  if (saveError || !saved) {
    await removeStoragePath(storagePath);
    return { ok: false, message: "문서 정보 저장에 실패했습니다." };
  }

  const oldPath =
    documentType === "business_reg"
      ? (existing?.business_reg_storage_path as string | null)
      : (existing?.bank_copy_storage_path as string | null);
  if (oldPath && oldPath !== storagePath) {
    await removeStoragePath(oldPath);
  }

  return {
    ok: true,
    id: saved.id,
    public_url: publicUrl,
    document_type: documentType,
    business_reg_url: saved.business_reg_public_url ?? null,
    bank_copy_url: saved.bank_copy_public_url ?? null,
    business_reg_key: saved.business_reg_key ?? null,
    bank_copy_key: saved.bank_copy_key ?? null,
  };
}

export async function linkMemberDocumentsToCafe24Member(params: {
  uploadSessionId: string;
  mallId: string;
  cafe24MemberId: string;
  bizNo?: string | null;
  confirm?: boolean;
}): Promise<
  | { ok: true; id: string | null; business_reg_url: string | null; bank_copy_url: string | null }
  | { ok: false; message: string }
> {
  const patch: Record<string, string | null> = {
    cafe24_member_id: params.cafe24MemberId,
    updated_at: new Date().toISOString(),
  };
  if (params.bizNo) patch.biz_no = params.bizNo;
  if (params.confirm !== false) patch.status = "confirmed";

  const { data, error } = await memberDocumentsTable()
    .update(patch)
    .eq("upload_session_id", params.uploadSessionId)
    .eq("mall_id", params.mallId)
    .select("id, business_reg_public_url, bank_copy_public_url")
    .maybeSingle();

  if (error) {
    return { ok: false, message: "회원 문서 연결에 실패했습니다." };
  }

  if (!data) {
    return { ok: false, message: "연결할 제출 문서를 찾을 수 없습니다." };
  }

  return {
    ok: true,
    id: data.id,
    business_reg_url: data.business_reg_public_url ?? null,
    bank_copy_url: data.bank_copy_public_url ?? null,
  };
}
