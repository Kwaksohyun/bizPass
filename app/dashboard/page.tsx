import { getServerSession } from "@/lib/auth/server-session";
import { shopsTable } from "@/lib/db";
import { ensureValidAccessToken } from "@/lib/api/ensureValidAccessToken";
import styles from "./dashboard.module.css";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ mall_id?: string }>;
}) {
  const sp = await searchParams;
  const session = await getServerSession();
  const mallId = sp.mall_id ?? session?.mall_id ?? "";

  if (!mallId) {
    return (
      <div className={styles.shell}>
        <div className={styles.inner}>
          <h1 className={styles.heading}>대시보드</h1>
          <p className={styles.lead}>
            세션에 몰 정보가 없습니다. 카페24 앱스토어에서 다시 실행하거나 URL에{" "}
            <code className={styles.mono}>?mall_id=</code>를 붙여 주세요.
          </p>
        </div>
      </div>
    );
  }

  const { data: shop } = await shopsTable()
    .select("*")
    .eq("mall_id", mallId)
    .maybeSingle();

  const tokenStatus = await ensureValidAccessToken(mallId);
  const tokenOk =
    typeof tokenStatus === "string" && tokenStatus.length > 0;
  const reinstall =
    typeof tokenStatus === "object" && tokenStatus?.reinstallRequired;

  return (
    <div className={styles.shell}>
      <div className={styles.inner}>
        <h1 className={styles.heading}>연동 완료</h1>
        <p className={styles.lead}>
          앱 설치(OAuth) 후 <code className={styles.mono}>shops</code> 테이블에
          저장된 쇼핑몰 정보입니다.
        </p>

        <dl className={styles.infoGrid}>
          <dt>mall_id</dt>
          <dd>{shop?.mall_id ?? mallId}</dd>
          <dt>shop_name</dt>
          <dd>{shop?.shop_name ?? "—"}</dd>
          <dt>shop_no</dt>
          <dd>{shop?.shop_no ?? "—"}</dd>
          <dt>primary_domain</dt>
          <dd>{shop?.primary_domain ?? "—"}</dd>
          <dt>토큰 상태</dt>
          <dd>
            {reinstall
              ? "재연동 필요"
              : tokenOk
                ? "정상"
                : shop
                  ? "토큰 없음/만료"
                  : "DB에 shop 없음 — OAuth 필요"}
          </dd>
          <dt>enabled</dt>
          <dd>{shop?.enabled ? "true" : "false"}</dd>
          <dt>updated_at</dt>
          <dd>{shop?.updated_at ?? "—"}</dd>
        </dl>

        {reinstall && (
          <p className={styles.warn}>
            토큰이 만료되었습니다.{" "}
            <a href={`/?mall_id=${mallId}&oauth_required=true`}>권한 다시 요청</a>
          </p>
        )}
      </div>
    </div>
  );
}
