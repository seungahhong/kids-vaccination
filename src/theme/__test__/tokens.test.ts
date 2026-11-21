import {
  contrastRatio,
  MIN_TEXT_CONTRAST,
  parseHexColor,
  relativeLuminance,
} from "@/theme/contrast";
import {
  CONTRAST_PAIRS,
  darkTokens,
  FONT_SIZE,
  lightTokens,
  MIN_TOUCH_TARGET,
  RADIUS,
  SPACING,
  THEME_TOKEN_KEYS,
  THEMES,
  type ThemeTokenKey,
} from "@/theme/tokens";

const HEX_COLOR = /^#[0-9a-f]{6}$/;

// G-6 (a) (NFR-05): CONTRAST_PAIRS 전 쌍이 두 테마 모두 ≥ 4.5:1. 컴포넌트는 여기 등록된 텍스트/배경 조합만 쓴다(설계서 §4.5).
describe("G-6 (a) CONTRAST_PAIRS 토큰 대비 ≥ 4.5:1 (두 테마)", () => {
  /** 설계서 §4.5가 대비를 실측한 텍스트/배경 쌍 */
  const REQUIRED_PAIRS: readonly (readonly [ThemeTokenKey, ThemeTokenKey])[] = [
    ["text", "background"],
    ["text", "surface"],
    ["text", "surfaceMuted"],
    ["textSecondary", "background"],
    ["textSecondary", "surface"],
    ["textPast", "surfaceMuted"],
    ["onPrimary", "primary"],
    ["onPrimarySoft", "primarySoft"],
    ["tabActive", "surface"],
    ["tabInactive", "surface"],
    ["chipText", "chipBackground"],
    ["badgeUpcomingText", "badgeUpcomingBackground"],
    ["badgeSoonText", "badgeSoonBackground"],
    ["badgePastText", "badgePastBackground"],
    ["danger", "background"],
    ["danger", "surface"],
    ["dangerText", "dangerSurface"],
    ["onDanger", "danger"],
  ];

  it("G-6 CONTRAST_PAIRS는 설계서 §4.5의 텍스트/배경 쌍을 모두 포함하고, 쌍마다 토큰 키 [fg, bg] 2개다", () => {
    for (const pair of REQUIRED_PAIRS) {
      expect(CONTRAST_PAIRS).toContainEqual(pair);
    }
    for (const pair of CONTRAST_PAIRS) {
      expect(pair).toHaveLength(2);
      expect(THEME_TOKEN_KEYS).toContain(pair[0]);
      expect(THEME_TOKEN_KEYS).toContain(pair[1]);
    }
  });

  it("G-6 textSecondary는 surfaceMuted 위에 쓰지 않는다(원본 stone-500 on stone-100 = 4.40 미달 조합은 등록하지 않음)", () => {
    expect(CONTRAST_PAIRS).not.toContainEqual([
      "textSecondary",
      "surfaceMuted",
    ]);
    // 배제 이유: light에서 4.5 미달
    expect(
      contrastRatio(lightTokens.textSecondary, lightTokens.surfaceMuted)
    ).toBeLessThan(MIN_TEXT_CONTRAST);
  });

  it.each(["light", "dark"] as const)(
    "G-6 (a) %s 테마: CONTRAST_PAIRS 전 쌍의 대비가 4.5:1 이상이다",
    (scheme) => {
      const tokens = THEMES[scheme];
      expect(CONTRAST_PAIRS.length).toBeGreaterThanOrEqual(
        REQUIRED_PAIRS.length
      );
      const below = CONTRAST_PAIRS.map(([fg, bg]) => ({
        fg,
        bg,
        ratio: contrastRatio(tokens[fg], tokens[bg]),
      })).filter(({ ratio }) => ratio < MIN_TEXT_CONTRAST);
      expect(below).toEqual([]);
    }
  );
});

// G-6 (d)·§4.5 크기 상수: 상호작용 요소 최소 44×44(PRD §7.2 G-6 (d)), 간격·모서리·글자 크기 스케일
describe("G-6 (d) 크기 상수", () => {
  it("G-6 MIN_TOUCH_TARGET은 44다", () => {
    expect(MIN_TOUCH_TARGET).toBe(44);
  });

  it("G-5 SPACING·RADIUS·FONT_SIZE는 양의 정수이고 오름차순 스케일이다", () => {
    for (const scale of [SPACING, RADIUS, FONT_SIZE]) {
      const values: number[] = Object.values(scale);
      expect(values.length).toBeGreaterThan(0);
      for (const value of values) {
        expect(Number.isInteger(value)).toBe(true);
        expect(value).toBeGreaterThan(0);
      }
      expect([...values].sort((a, b) => a - b)).toEqual(values);
    }
  });
});

// G-6 (a) (NFR-05) 대비 계산기: WCAG 2.x 상대 휘도·대비 공식. 설계서 §4.5의 실측값으로 계산기 자체를 교차 검증한다.
describe("G-6 (a) WCAG 대비 계산(src/theme/contrast.ts)", () => {
  it("G-6 parseHexColor는 #rrggbb(대소문자 무관)를 0~255 RGB로 푼다", () => {
    expect(parseHexColor("#fafaf9")).toEqual({ r: 250, g: 250, b: 249 });
    expect(parseHexColor("#1C1917")).toEqual({ r: 28, g: 25, b: 23 });
    expect(parseHexColor("#000000")).toEqual({ r: 0, g: 0, b: 0 });
  });

  it.each(["fafaf9", "#fff", "#gggggg", "", "#fafaf9ff", " #fafaf9"])(
    "G-6 parseHexColor(%j)는 #rrggbb가 아니므로 throw한다",
    (value) => {
      expect(() => parseHexColor(value)).toThrow(/#rrggbb/);
    }
  );

  it("G-6 relativeLuminance: #ffffff → 1, #000000 → 0, #808080 ≈ 0.2159", () => {
    expect(relativeLuminance("#ffffff")).toBeCloseTo(1, 6);
    expect(relativeLuminance("#000000")).toBeCloseTo(0, 6);
    expect(relativeLuminance("#808080")).toBeCloseTo(0.2159, 4);
  });

  it("G-6 contrastRatio: 흰/검 21:1, 같은 색 1:1, 인자 순서에 무관하다", () => {
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 6);
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 6);
    expect(contrastRatio("#0f766e", "#0f766e")).toBeCloseTo(1, 6);
    expect(contrastRatio("#78716c", "#fafaf9")).toBeCloseTo(
      contrastRatio("#fafaf9", "#78716c"),
      10
    );
  });

  it("G-6 contrastRatio는 설계서 §4.5 실측값과 일치한다(소수 둘째 자리)", () => {
    // light
    expect(contrastRatio(lightTokens.text, lightTokens.background)).toBeCloseTo(
      16.74,
      2
    );
    expect(
      contrastRatio(lightTokens.textSecondary, lightTokens.background)
    ).toBeCloseTo(4.59, 2);
    expect(
      contrastRatio(lightTokens.onPrimary, lightTokens.primary)
    ).toBeCloseTo(5.47, 2);
    expect(
      contrastRatio(lightTokens.badgeSoonText, lightTokens.badgeSoonBackground)
    ).toBeCloseTo(4.88, 2);
    expect(
      contrastRatio(lightTokens.danger, lightTokens.background)
    ).toBeCloseTo(4.62, 2);
    // dark
    expect(
      contrastRatio(darkTokens.tabInactive, darkTokens.surface)
    ).toBeCloseTo(6.01, 2);
    expect(contrastRatio(darkTokens.danger, darkTokens.surface)).toBeCloseTo(
      5.48,
      2
    );
  });

  it("G-6 MIN_TEXT_CONTRAST는 WCAG AA 본문 기준 4.5다", () => {
    expect(MIN_TEXT_CONTRAST).toBe(4.5);
  });
});

// G-7 (NFR-06): light/dark 토큰 키 집합이 같고, primary 계열 #14b8a6, accent 계열 #f97316, stone 배경 #fafaf9/#1c1917가 포함된다.
// 값은 설계서 §4.5 토큰 표(PRD §3.4 요약)를 그대로 따른다 — E2E의 rgb 기대값(AC-11.x, AC-15.2)이 이 값에서 나온다.
describe("G-7 테마 토큰 키 동일성", () => {
  it("G-7 THEME_TOKEN_KEYS는 설계서 §4.5의 28개 키 + 분류 배지 4개(U-15) + 완료 표시 5개(U-22: 상태 점·배지 2·체크박스 2) + 헤더 메뉴 그림자 1개(U-25) = 38개이고 중복이 없다", () => {
    expect(THEME_TOKEN_KEYS).toHaveLength(38);
    expect(new Set(THEME_TOKEN_KEYS).size).toBe(38);
  });

  it("G-7 lightTokens와 darkTokens의 키 집합은 THEME_TOKEN_KEYS와 같다", () => {
    const expected = [...THEME_TOKEN_KEYS].sort();
    expect(Object.keys(lightTokens).sort()).toEqual(expected);
    expect(Object.keys(darkTokens).sort()).toEqual(expected);
  });

  it("G-7 모든 토큰 값은 소문자 #rrggbb 형식이다", () => {
    for (const key of THEME_TOKEN_KEYS) {
      expect(lightTokens[key]).toMatch(HEX_COLOR);
      expect(darkTokens[key]).toMatch(HEX_COLOR);
    }
  });

  it("G-7 primary 계열 #14b8a6(statusUpcoming)과 accent 계열 #f97316(statusSoon)이 두 테마에 있다", () => {
    expect(lightTokens.statusUpcoming).toBe("#14b8a6");
    expect(darkTokens.statusUpcoming).toBe("#14b8a6");
    expect(lightTokens.statusSoon).toBe("#f97316");
    expect(darkTokens.statusSoon).toBe("#f97316");
  });

  it("G-7 stone 계열 배경은 light #fafaf9 / dark #1c1917이고 THEMES가 scheme별 토큰 객체를 가리킨다(AC-11.1·11.2 rgb 기대값)", () => {
    expect(lightTokens.background).toBe("#fafaf9");
    expect(darkTokens.background).toBe("#1c1917");
    expect(THEMES.light).toBe(lightTokens);
    expect(THEMES.dark).toBe(darkTokens);
  });

  it("G-7 PRD §3.4 요약 값과 일치: 카드·지남 카드·본문·보조·지남 텍스트·CTA·탭·상태 점·위험", () => {
    expect([lightTokens.surface, darkTokens.surface]).toEqual([
      "#ffffff",
      "#292524",
    ]);
    expect([lightTokens.surfaceMuted, darkTokens.surfaceMuted]).toEqual([
      "#f5f5f4",
      "#231f1d",
    ]);
    expect([lightTokens.text, darkTokens.text]).toEqual(["#1c1917", "#fafaf9"]);
    expect([lightTokens.textSecondary, darkTokens.textSecondary]).toEqual([
      "#78716c",
      "#a8a29e",
    ]);
    expect([lightTokens.textPast, darkTokens.textPast]).toEqual([
      "#57534e",
      "#a8a29e",
    ]);
    expect([lightTokens.primary, darkTokens.primary]).toEqual([
      "#0f766e",
      "#0f766e",
    ]);
    expect([lightTokens.onPrimary, darkTokens.onPrimary]).toEqual([
      "#ffffff",
      "#ffffff",
    ]);
    // AC-15.2: 활성 탭 rgb(15, 118, 110), 비활성 탭 rgb(120, 113, 108)
    expect([lightTokens.tabActive, darkTokens.tabActive]).toEqual([
      "#0f766e",
      "#2dd4bf",
    ]);
    expect([lightTokens.tabInactive, darkTokens.tabInactive]).toEqual([
      "#78716c",
      "#a8a29e",
    ]);
    expect([lightTokens.statusPast, darkTokens.statusPast]).toEqual([
      "#d6d3d1",
      "#57534e",
    ]);
    expect([lightTokens.danger, darkTokens.danger]).toEqual([
      "#dc2626",
      "#f87171",
    ]);
  });
});
