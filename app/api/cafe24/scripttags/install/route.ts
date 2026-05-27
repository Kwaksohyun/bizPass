import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { readFile } from "fs/promises";
import path from "path";

import { ensureValidAccessToken } from "@/lib/api/ensureValidAccessToken";
import { callCafe24Api } from "@/lib/api/cafe24Api";
import { shopsTable } from "@/lib/db";
import { logger } from "@/lib/utils/logger";

export async function POST(req: NextRequest) {
  const mall_id = req.nextUrl.searchParams.get("mall_id");
  if (!mall_id) {
    return NextResponse.json(
      { error: "mall_id required" },
      { status: 400 },
    );
  }

  const tokenStatus = await ensureValidAccessToken(mall_id);
  if (tokenStatus === null) {
    return NextResponse.json(
      { error: "No shop or token" },
      { status: 404 },
    );
  }
  if (typeof tokenStatus !== "string") {
    return NextResponse.json(
      { error: "reinstall_required", message: "앱 재연동(OAuth)이 필요합니다." },
      { status: 403 },
    );
  }

  const accessToken = tokenStatus;

  const { data: shop } = await shopsTable()
    .select("shop_no")
    .eq("mall_id", mall_id)
    .maybeSingle();

  const shopNoRaw = shop?.shop_no ?? "1";
  const shopNo = Number.parseInt(shopNoRaw, 10) || 1;

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    `${req.nextUrl.protocol}//${req.nextUrl.host}`;
  const src = `${baseUrl.replace(/\/$/, "")}/biz-auth-filter.js`;

  const scriptPath = path.join(
    process.cwd(),
    "public",
    "biz-auth-filter.js",
  );
  const scriptBuf = await readFile(scriptPath);
  const integrity = `sha384-${crypto
    .createHash("sha384")
    .update(scriptBuf)
    .digest("base64")}`;

  const payload = {
    shop_no: shopNo,
    request: {
      src,
      display_location: ["MEMBER_JOIN"],
      integrity,
    },
  };

  logger.info("Cafe24 scripttag 설치 시작", {
    mall_id,
    shopNo,
    src,
  });

  const res = await callCafe24Api({
    mallId: mall_id,
    endpoint: "admin/scripttags",
    method: "POST",
    accessToken,
    body: payload,
  });

  if (!res.success) {
    return NextResponse.json(
      { error: res.error ?? "Failed to install scripttag" },
      { status: 502 },
    );
  }

  return NextResponse.json({
    success: true,
    data: res.data ?? null,
  });
}

