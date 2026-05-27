# cafe24_init

카페24 앱 **OAuth · 토큰 갱신 · shops 저장** 스타터입니다.  
(쇼핑몰 정책 API 등 비즈니스 기능은 제외)

## Supabase

1. `supabase/schema.sql` 실행 (기본 스키마: `cafe24_app`)
2. `.env`에 `SUPABASE_APP_SCHEMA=cafe24_app` (스키마 이름을 바꿨다면 SQL과 동일하게)

## 환경 변수

`.env.example` 참고.

## 앱 설치 흐름

```
카페24 앱 실행 (mall_id, user_id, hmac…)
  → /api/auth/session-from-cafe24
  → shops 없으면 /?oauth_required=true
  → /api/oauth/authorize → 카페24 동의
  → /api/oauth/callback → saveShopFromOAuth() → shops upsert
  → /dashboard
```

## 주요 코드

| 경로 | 설명 |
|------|------|
| `lib/shops/saveShop.ts` | OAuth 후 토큰 + admin/store → `shops` upsert |
| `lib/api/ensureValidAccessToken.ts` | access_token 갱신 |
| `lib/api/getShop.ts` | mall_id로 shop 조회 |
| `app/api/oauth/*` | 인증 시작·콜백 |

## 로컬 실행

```bash
npm install
npm run dev
```

수동 OAuth: http://localhost:3000/authorize
