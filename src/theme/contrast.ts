// WCAG 2.x 대비 계산(설계서 §4.5·§10.6, G-6 (a)). 순수 모듈 — React·RN을 import하지 않는다(§2.1).
// 토큰 표기인 '#rrggbb'만 다루며, 렌더 결과의 대비는 E2E 스캔(G-6 (b))이 computed 색으로 따로 검사한다.

export type Rgb = {
  readonly r: number;
  readonly g: number;
  readonly b: number;
};

/** WCAG 2.x AA 본문 텍스트 최소 대비(1.4.3) */
export const MIN_TEXT_CONTRAST = 4.5;

const HEX_RRGGBB = /^#[0-9a-f]{6}$/i;

/** '#rrggbb'(대소문자 무관)만 받는다. 축약형·알파 채널·공백은 토큰 표기가 아니므로 throw */
export function parseHexColor(hex: string): Rgb {
  if (!HEX_RRGGBB.test(hex)) {
    throw new Error(
      `parseHexColor: '#rrggbb' 형식이 아닙니다: ${JSON.stringify(hex)}`
    );
  }
  const channel = (offset: number): number =>
    Number.parseInt(hex.slice(offset, offset + 2), 16);
  return { r: channel(1), g: channel(3), b: channel(5) };
}

/** sRGB 8비트 채널 → 선형 값(WCAG 상대 휘도 정의) */
function linearize(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** WCAG 상대 휘도 L (검정 0 ~ 흰색 1) */
export function relativeLuminance(hex: string): number {
  const { r, g, b } = parseHexColor(hex);
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

/** (L_lighter + 0.05) / (L_darker + 0.05). 1(같은 색) ~ 21(흰/검), 인자 순서에 무관 */
export function contrastRatio(foreground: string, background: string): number {
  const l1 = relativeLuminance(foreground);
  const l2 = relativeLuminance(background);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}
