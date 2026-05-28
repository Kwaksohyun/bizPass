export const MEMBER_DOCUMENT_TYPES = ["business_reg", "bank_copy"] as const;

export type MemberDocumentType = (typeof MEMBER_DOCUMENT_TYPES)[number];

export function isMemberDocumentType(value: string): value is MemberDocumentType {
  return (MEMBER_DOCUMENT_TYPES as readonly string[]).includes(value);
}

export const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export const DOCUMENT_KEY_REGEX = /^[a-z]+_[a-z0-9]+_[a-z0-9]+$/i;
