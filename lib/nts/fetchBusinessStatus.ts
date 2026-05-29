import { config } from "@/lib/config/env";
import { logger } from "@/lib/utils/logger";

const NTS_STATUS_URL =
  "https://api.odcloud.kr/api/nts-businessman/v1/status";

export type BizStatusCheckResult =
  | { ok: true; bSttCd: "01"; bStt: string }
  | { ok: false; message: string; bSttCd?: string };

interface NtsStatusRow {
  b_no?: string;
  b_stt?: string;
  b_stt_cd?: string;
}

interface NtsStatusResponse {
  status_code?: string;
  match_cnt?: number;
  request_cnt?: number;
  data?: NtsStatusRow[];
}

interface NtsErrorBody {
  code?: number;
  msg?: string;
}

type NtsErrorCategory =
  | "backend_unavailable"
  | "service_config"
  | "rate_limit"
  | "quota_exceeded"
  | "network"
  | "parse_error"
  | "unknown";

const USER_MSG = {
  backendUnavailable:
    "국세청 사업자 확인 서비스가 일시적으로 이용 불가합니다. 잠시 후 다시 시도해 주세요.",
  serviceUnavailable:
    "사업자 확인 기능을 일시적으로 이용할 수 없습니다. 잠시 후 다시 시도해 주세요.",
  rateLimit:
    "지금은 확인 요청이 많습니다. 잠시 후 다시 시도해 주세요.",
  quotaExceeded:
    "오늘 사업자 확인 이용 한도에 도달했습니다. 내일 다시 시도해 주세요.",
  network:
    "사업자 확인에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.",
  invalidBizNo:
    "유효하지 않은 사업자번호입니다. 번호를 다시 확인해 주세요.",
  closed: "휴업 상태의 사업자입니다. 가입이 제한됩니다.",
  shutdown: "폐업 상태의 사업자입니다. 가입이 제한됩니다.",
  fallback:
    "사업자 확인에 실패했습니다. 잠시 후 다시 시도해 주세요. 문제가 계속되면 고객센터로 문의해 주세요.",
} as const;

function maskBizNo(bizNo: string): string {
  if (bizNo.length !== 10) return "****";
  return `${bizNo.slice(0, 3)}****${bizNo.slice(7)}`;
}

function userMessageForCategory(category: NtsErrorCategory): string {
  switch (category) {
    case "backend_unavailable":
      return USER_MSG.backendUnavailable;
    case "service_config":
      return USER_MSG.serviceUnavailable;
    case "rate_limit":
      return USER_MSG.rateLimit;
    case "quota_exceeded":
      return USER_MSG.quotaExceeded;
    case "network":
      return USER_MSG.network;
    case "parse_error":
    case "unknown":
      return USER_MSG.fallback;
  }
}

function classifyGatewayMessage(msg: string): NtsErrorCategory | null {
  const normalized = msg.toLowerCase();

  if (normalized.includes("unauthorized") || normalized.includes("forbidden")) {
    return "service_config";
  }
  if (
    normalized.includes("rate limit") ||
    normalized.includes("rate_limit")
  ) {
    return "rate_limit";
  }
  if (
    normalized.includes("quota exceeded") ||
    normalized.includes("token quota")
  ) {
    return "quota_exceeded";
  }
  if (
    normalized.includes("forwarding request to backend") ||
    normalized.includes("receiving response from backend") ||
    normalized.includes("unexpected error")
  ) {
    return "backend_unavailable";
  }
  if (normalized.includes("api not found")) {
    return "unknown";
  }

  return null;
}

function classifyNtsApiError(
  body: NtsErrorBody | null,
  httpStatus: number,
): NtsErrorCategory {
  const code = body?.code;
  const msg = body?.msg?.trim() ?? "";

  if (code === -4) return "service_config";
  if (code === -5) return "backend_unavailable";

  const fromMsg = msg ? classifyGatewayMessage(msg) : null;
  if (fromMsg) return fromMsg;

  if (httpStatus === 429) return "rate_limit";
  if (httpStatus >= 500) return "backend_unavailable";
  if (httpStatus >= 400) return "unknown";

  return "unknown";
}

function logNtsApiError(
  bizNo: string,
  detail: {
    category: NtsErrorCategory;
    httpStatus?: number;
    code?: number;
    rawMsg?: string;
    hint?: string;
  },
): void {
  logger.warn("nts_api_error", {
    category: detail.category,
    httpStatus: detail.httpStatus ?? null,
    code: detail.code ?? null,
    rawMsg: detail.rawMsg ?? null,
    hint: detail.hint ?? null,
    bizNo: maskBizNo(bizNo),
  });
}

function failFromApiError(
  bizNo: string,
  body: NtsErrorBody | null,
  httpStatus: number,
): BizStatusCheckResult {
  const category = classifyNtsApiError(body, httpStatus);
  logNtsApiError(bizNo, {
    category,
    httpStatus,
    code: body?.code,
    rawMsg: body?.msg,
    hint:
      category === "service_config"
        ? "check DATA_GO_KR_SERVICE_KEY and 활용승인"
        : undefined,
  });
  return { ok: false, message: userMessageForCategory(category) };
}

async function parseNtsErrorBody(res: Response): Promise<NtsErrorBody | null> {
  try {
    return (await res.json()) as NtsErrorBody;
  } catch {
    return null;
  }
}

/** 사업자등록번호 10자리 숫자만 허용 */
export function normalizeBizNo(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 10) return null;
  return digits;
}

/**
 * 국세청 사업자 상태조회 (b_stt_cd)
 * 01 계속사업자 — 통과, 02 휴업, 03 폐업 — 차단
 * @see https://www.data.go.kr/data/15081808/openapi.do
 */
export async function fetchBusinessStatus(
  bizNo: string,
): Promise<BizStatusCheckResult> {
  const serviceKey = config.nts.serviceKey;
  if (!serviceKey) {
    logger.warn("nts_api_error", {
      category: "service_config",
      hint: "DATA_GO_KR_SERVICE_KEY is missing",
      bizNo: maskBizNo(bizNo),
    });
    return { ok: false, message: USER_MSG.serviceUnavailable };
  }

  const url = `${NTS_STATUS_URL}?serviceKey=${encodeURIComponent(serviceKey)}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ b_no: [bizNo] }),
      cache: "no-store",
    });
  } catch (err) {
    logger.warn("nts_api_error", {
      category: "network",
      bizNo: maskBizNo(bizNo),
      error: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, message: USER_MSG.network };
  }

  if (res.status >= 400) {
    const errBody = await parseNtsErrorBody(res);
    return failFromApiError(bizNo, errBody, res.status);
  }

  let body: NtsStatusResponse;
  try {
    body = (await res.json()) as NtsStatusResponse;
  } catch (err) {
    logger.warn("nts_api_error", {
      category: "parse_error",
      httpStatus: res.status,
      bizNo: maskBizNo(bizNo),
      error: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, message: USER_MSG.fallback };
  }

  if (body.status_code && body.status_code !== "OK") {
    return { ok: false, message: USER_MSG.invalidBizNo };
  }

  const row = body.data?.[0];
  if (!row || (body.match_cnt !== undefined && body.match_cnt < 1)) {
    return { ok: false, message: USER_MSG.invalidBizNo };
  }

  const bSttCd = row.b_stt_cd ?? "";
  const bStt = row.b_stt ?? "";

  // 국세청이 200으로 주지만 b_stt에 미등록 안내가 오는 경우
  if (
    !bSttCd &&
    /등록되지\s*않|유효하지\s*않|존재하지/.test(bStt)
  ) {
    return {
      ok: false,
      message: USER_MSG.invalidBizNo,
    };
  }

  if (bSttCd === "01") {
    return { ok: true, bSttCd: "01", bStt };
  }
  if (bSttCd === "02") {
    return { ok: false, message: USER_MSG.closed, bSttCd: "02" };
  }
  if (bSttCd === "03") {
    return { ok: false, message: USER_MSG.shutdown, bSttCd: "03" };
  }

  return {
    ok: false,
    message: USER_MSG.invalidBizNo,
    bSttCd,
  };
}
