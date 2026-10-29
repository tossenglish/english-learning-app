/**
 * 한국 휴대전화 번호를 숫자만 남긴 형태(01012345678)로 정규화합니다.
 * 형식이 올바르지 않으면 null 을 돌려줍니다.
 */
export function normalizeKoreanMobile(input: string): string | null {
  let digits = input.replace(/[^\d+]/g, "");
  if (digits.startsWith("+82")) digits = `0${digits.slice(3)}`;
  else if (digits.startsWith("82") && digits.length >= 11) digits = `0${digits.slice(2)}`;
  digits = digits.replace(/\D/g, "");
  return /^01[016789]\d{7,8}$/.test(digits) ? digits : null;
}

/** 목록 화면 표시용 마스킹: 010-****-5678 */
export function formatPhoneForDisplay(phone: string): string {
  if (phone.length < 10) return phone;
  const head = phone.slice(0, 3);
  const tail = phone.slice(-4);
  return `${head}-${phone.length === 11 ? "****" : "***"}-${tail}`;
}
