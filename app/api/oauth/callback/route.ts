import { NextRequest, NextResponse } from "next/server";
import { ensureScriptTagInstalled } from "@/lib/cafe24/scripttags";
import { oauthStatesTable } from "@/lib/db";
import { saveShopFromOAuth } from "@/lib/shops/saveShop";
import { logger } from "@/lib/utils/logger";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");
  const error_description = searchParams.get("error_description");

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    `${req.nextUrl.protocol}//${req.nextUrl.host}`;

  if (error) {
    logger.error("OAuth 에러", { error, error_description, state });
    const mall_id = state?.split(":")[0] || "";
    const errorUrl = `${baseUrl}/?error=oauth_failed&error_description=${encodeURIComponent(
      error_description || error,
    )}&mall_id=${mall_id}`;
    return NextResponse.redirect(errorUrl);
  }

  if (!code || !state) {
    return NextResponse.json(
      { error: "Missing code or state" },
      { status: 400 },
    );
  }

  const { data: stateData, error: stateError } = await oauthStatesTable()
    .select("*")
    .eq("state", state)
    .gte("expires_at", new Date().toISOString())
    .single();

  if (stateError || !stateData) {
    logger.error("State 검증 실패", { stateError, state });
    return NextResponse.json(
      { error: "Invalid or expired state parameter" },
      { status: 400 },
    );
  }

  const mall_id = stateData.mall_id as string;

  await oauthStatesTable().delete().eq("state", state);

  try {
    const credentials = btoa(
      `${process.env.CAFE24_CLIENT_ID}:${process.env.CAFE24_CLIENT_SECRET}`,
    );

    const tokenRes = await fetch(
      `https://${mall_id}.cafe24api.com/api/v2/oauth/token`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${credentials}`,
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: process.env.CAFE24_REDIRECT_URI!,
        }),
      },
    );

    const token = await tokenRes.json();

    if (!token.access_token) {
      logger.error("토큰 요청 실패", {
        status: tokenRes.status,
        error: token.error,
        mall_id,
      });
      return NextResponse.json(
        { error: "Failed to get access token", details: token },
        { status: 500 },
      );
    }

    const saveResult = await saveShopFromOAuth(token, mall_id);

    if ("error" in saveResult) {
      return NextResponse.json(
        { error: "Failed to save shop", details: saveResult.error },
        { status: 500 },
      );
    }

    await ensureScriptTagInstalled(
      saveResult.mall_id,
      token.access_token,
      token.shop_no || "1",
    );

    const { createSession, setSessionCookie } =
      await import("@/lib/auth/session");

    const sessionToken = await createSession({
      mall_id: saveResult.mall_id,
      user_id: token.user_id,
      shop_no: token.shop_no || "1",
    });

    const redirectUrl = `${baseUrl}/dashboard?mall_id=${saveResult.mall_id}`;
    const response = NextResponse.redirect(redirectUrl);
    return setSessionCookie(response, sessionToken);
  } catch (err) {
    logger.error("OAuth Callback 오류", { err });
    return NextResponse.json(
      {
        error: "Internal server error",
        details:
          process.env.NODE_ENV === "development"
            ? err instanceof Error
              ? err.message
              : String(err)
            : undefined,
      },
      { status: 500 },
    );
  }
}
