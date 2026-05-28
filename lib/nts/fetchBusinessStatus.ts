import { config } from "@/lib/config/env";

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

/** 공공데이터 API 오류 code → 사용자 메시지 */
function mapNtsApiError(body: NtsErrorBody | null, httpStatus: number): string {
  const code = body?.code;
  const msg = body?.msg?.trim();

  if (code === -4) {
    return "사업자 확인 API 인증키가 등록되지 않았습니다. 공공데이터포털 활용신청·Vercel 환경변수를 확인해 주세요.";
  }
  if (code === -5) {
    return "국세청 사업자 확인 API에 연결할 수 없습니다. 인증키(인코딩/디코딩)·활용승인 상태를 확인해 주세요.";
  }
  if (msg) return msg;

  if (httpStatus >= 500) {
    return "사업자 확인 서버가 일시적으로 응답하지 않습니다. 잠시 후 다시 시도해 주세요.";
  }
  if (httpStatus >= 400) {
    return "사업자 확인 API 요청이 거부되었습니다. 인증키 설정을 확인해 주세요.";
  }

  return "사업자 확인에 실패했습니다. 잠시 후 다시 시도해 주세요.";
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
    return { ok: false, message: "사업자 확인 서비스 설정이 없습니다." };
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
  } catch {
    return {
      ok: false,
      message: "사업자 확인에 실패했습니다. 잠시 후 다시 시도해 주세요.",
    };
  }

  if (res.status >= 400) {
    const errBody = await parseNtsErrorBody(res);
    return { ok: false, message: mapNtsApiError(errBody, res.status) };
  }

  let body: NtsStatusResponse;
  try {
    body = (await res.json()) as NtsStatusResponse;
  } catch {
    return {
      ok: false,
      message: "사업자 확인 응답을 처리할 수 없습니다.",
    };
  }

  if (body.status_code && body.status_code !== "OK") {
    return { ok: false, message: "유효하지 않은 사업자번호입니다." };
  }

  const row = body.data?.[0];
  if (!row || (body.match_cnt !== undefined && body.match_cnt < 1)) {
    return { ok: false, message: "유효하지 않은 사업자번호입니다." };
  }

  const bSttCd = row.b_stt_cd ?? "";
  const bStt = row.b_stt ?? "";

  // 국세청이 200으로 주지만 b_stt에 미등록 안내가 오는 경우
  if (
    !bSttCd &&
    /등록되지\s*않|유효하지\s*않|존재하지/.test(bStt)
  ) {
    return { ok: false, message: bStt || "유효하지 않은 사업자번호입니다." };
  }

  if (bSttCd === "01") {
    return { ok: true, bSttCd: "01", bStt };
  }
  if (bSttCd === "02") {
    return { ok: false, message: "휴업자입니다.", bSttCd: "02" };
  }
  if (bSttCd === "03") {
    return { ok: false, message: "폐업자입니다.", bSttCd: "03" };
  }

  return {
    ok: false,
    message: "유효하지 않은 사업자번호입니다.",
    bSttCd,
  };
}
