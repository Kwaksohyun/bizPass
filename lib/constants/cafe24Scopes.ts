// lib/constants/cafe24Scopes.ts

/**
 * 카페24 개발자센터에서 승인받은 권한과 1:1로 일치해야 함.
 * 새 권한이 필요하면: 개발자센터 > 해당 앱 > 권한 추가 → 여기에 추가 → 사용자 재설치(OAuth).
 */

export const cafe24Scopes = [
  // 1. 앱(Application) — 읽기+쓰기
  "mall.read_application",
  "mall.write_application",
  "mall.read_product",

  // 주의: mall.write_product와 mall.read_order는
  // Cafe24 개발자 센터에서 별도 승인이 필요합니다.
  // 개발자 센터에서 "상품(Product)" Read + Write와 "주문(Order)" Read 권한을
  // 설정한 후 아래 주석을 해제하세요.
  // "mall.write_product", // 상품 가격 변경을 위해 필요
  // "mall.read_order", // 주문 조회를 위해 필요

  // 2. 개인화정보(Personal) — 읽기+쓰기
  "mall.read_personal",
  "mall.write_personal",

  // 3. 회원(Customer) — 읽기+쓰기
  "mall.read_customer",
  "mall.write_customer",

  // 4. 상점(Store) — 읽기
  "mall.read_store",
];
