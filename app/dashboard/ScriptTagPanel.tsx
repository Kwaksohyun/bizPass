"use client";

import { useCallback, useState } from "react";

import type { Cafe24ScriptTag } from "@/lib/utils/scriptTag";

import styles from "./dashboard.module.css";

export type ScriptTagPanelInitial = {
  src: string;
  display_location: readonly string[];
  installed: boolean;
  scripttag: Cafe24ScriptTag | null;
  autoSyncMessage?: string | null;
  autoSyncError?: string | null;
  fetchError?: string;
};

type ScriptTagApiResponse = {
  src?: string;
  display_location?: string[];
  installed?: boolean;
  scripttag?: Cafe24ScriptTag | null;
  message?: string | null;
  error?: string;
  success?: boolean;
};

type Props = {
  mallId: string;
  tokenOk: boolean;
  reinstall: boolean;
  initial: ScriptTagPanelInitial | null;
};

export function ScriptTagPanel({
  mallId,
  tokenOk,
  reinstall,
  initial,
}: Props) {
  const [status, setStatus] = useState<ScriptTagPanelInitial | null>(initial);
  const [loading, setLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(
    initial?.autoSyncMessage ?? null,
  );
  const [actionError, setActionError] = useState<string | null>(
    initial?.autoSyncError ?? initial?.fetchError ?? null,
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    setActionMessage(null);
    setActionError(null);
    try {
      const res = await fetch(
        `/api/cafe24/scripttags?mall_id=${encodeURIComponent(mallId)}`,
        { credentials: "include" },
      );
      const data = (await res.json()) as ScriptTagApiResponse;
      if (!res.ok) {
        setActionError(data.error ?? data.message ?? "상태 조회에 실패했습니다.");
        return;
      }
      setStatus({
        src: data.src ?? initial?.src ?? "",
        display_location: data.display_location ?? initial?.display_location ?? [],
        installed: !!data.installed,
        scripttag: data.scripttag ?? null,
      });
      if (data.message) {
        setActionMessage(data.message);
      }
      if (data.error) {
        setActionError(data.error);
      }
    } catch {
      setActionError("상태 조회 중 네트워크 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }, [mallId, initial?.src, initial?.display_location]);

  const install = useCallback(async () => {
    setLoading(true);
    setActionMessage(null);
    setActionError(null);
    try {
      const res = await fetch(
        `/api/cafe24/scripttags?mall_id=${encodeURIComponent(mallId)}`,
        { method: "POST", credentials: "include" },
      );
      const data = (await res.json()) as ScriptTagApiResponse;
      if (!res.ok) {
        setActionError(data.error ?? data.message ?? "scripttag 설치에 실패했습니다.");
        return;
      }
      setStatus((prev) => ({
        src: data.scripttag?.src ?? prev?.src ?? initial?.src ?? "",
        display_location:
          data.scripttag?.display_location ??
          prev?.display_location ??
          initial?.display_location ??
          [],
        installed: true,
        scripttag: data.scripttag ?? prev?.scripttag ?? null,
      }));
      setActionMessage(data.message ?? "scripttag 설치가 완료되었습니다.");
    } catch {
      setActionError("설치 중 네트워크 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }, [mallId, initial?.src, initial?.display_location]);

  if (reinstall) {
    return (
      <section className={styles.scriptTagSection} aria-labelledby="scripttag-heading">
        <h2 id="scripttag-heading" className={styles.sectionHeading}>
          회원가입 scripttag
        </h2>
        <p className={styles.sectionLead}>
          앱 재연동(OAuth) 시 scripttag가 자동 등록·갱신됩니다. 토큰 재연동 후
          대시보드에서 상태를 확인하세요.
        </p>
      </section>
    );
  }

  if (!tokenOk) {
    return (
      <section className={styles.scriptTagSection} aria-labelledby="scripttag-heading">
        <h2 id="scripttag-heading" className={styles.sectionHeading}>
          회원가입 scripttag
        </h2>
        <p className={styles.sectionLead}>
          OAuth 연동(유효한 액세스 토큰)이 필요합니다.
        </p>
      </section>
    );
  }

  const installed = status?.installed ?? false;
  const locations = status?.display_location?.length
    ? status.display_location.join(", ")
    : "MEMBER_JOIN";

  return (
    <section className={styles.scriptTagSection} aria-labelledby="scripttag-heading">
      <h2 id="scripttag-heading" className={styles.sectionHeading}>
        회원가입 scripttag
      </h2>
      <p className={styles.sectionLead}>
        <code className={styles.mono}>biz-auth-filter.js</code>를 카페24
        회원가입 페이지에 자동 삽입합니다. OAuth 재연동·대시보드 접속 시
        scripttag가 자동으로 설치·갱신됩니다. join.html에{" "}
        <code className={styles.mono}>&lt;script&gt;</code>를 넣지 마세요.
      </p>

      {status?.fetchError && !actionError && (
        <p className={styles.scriptTagError} role="alert">
          초기 조회 실패: {status.fetchError}
        </p>
      )}

      <dl className={styles.infoGrid}>
        <dt>설치 상태</dt>
        <dd>
          <span
            className={
              installed ? styles.statusOk : styles.statusPending
            }
          >
            {installed ? "설치됨" : "미설치"}
          </span>
        </dd>
        <dt>script src</dt>
        <dd>{status?.src ?? "—"}</dd>
        <dt>노출 위치</dt>
        <dd>{locations}</dd>
        {status?.scripttag?.script_no && (
          <>
            <dt>script_no</dt>
            <dd>{String(status.scripttag.script_no)}</dd>
          </>
        )}
      </dl>

      <div className={styles.scriptTagActions}>
        {!installed && (
          <button
            type="button"
            className={styles.primaryBtn}
            onClick={install}
            disabled={loading}
          >
            {loading ? "처리 중…" : "scripttag 설치"}
          </button>
        )}
        <button
          type="button"
          className={styles.secondaryBtn}
          onClick={refresh}
          disabled={loading}
        >
          {loading ? "조회 중…" : "상태 새로고침"}
        </button>
      </div>

      {actionMessage && (
        <p className={styles.scriptTagSuccess} role="status">
          {actionMessage}
        </p>
      )}
      {actionError && (
        <p className={styles.scriptTagError} role="alert">
          {actionError}
        </p>
      )}

      {installed && (
        <p className={styles.scriptTagHint}>
          회원가입 페이지에서 Console:{" "}
          <code className={styles.mono}>
            document.querySelectorAll(&apos;script[src*=&quot;biz-auth-filter&quot;]&apos;).length
          </code>{" "}
          → 1 이어야 합니다.
        </p>
      )}
    </section>
  );
}
