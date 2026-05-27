import { config } from "@/lib/config/env";

export interface Cafe24ScriptTag {
  shop_no?: number;
  script_no?: string;
  src?: string;
  display_location?: string[];
  client_id?: string;
  [key: string]: unknown;
}

/** 카페24 scripttags 응답에서 우리 앱(client_id)이 등록한 것만 추출 */
export function filterOurScriptTags(
  scripts: Cafe24ScriptTag[],
): Cafe24ScriptTag[] {
  const ourClientId = config.cafe24.clientId;
  if (!ourClientId) return [];
  return scripts.filter((s) => s.client_id === ourClientId);
}
