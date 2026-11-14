import {
  isThemePreference,
  resolveColorScheme,
  THEME_PREFERENCES,
} from "@/lib/themePreference";
import type { ColorScheme, ThemePreference } from "@/types";

// AC-11.5 (FR-08) 순수 조합 5건. Provider 재렌더 부분은 P5 src/contexts/__test__/ThemeContext.test.tsx가 판정한다.
describe("AC-11.5 resolveColorScheme (선호, 시스템) 조합", () => {
  const cases: readonly (readonly [
    ThemePreference,
    ColorScheme | null,
    ColorScheme,
  ])[] = [
    ["system", "dark", "dark"],
    ["system", "light", "light"],
    ["system", null, "light"],
    ["light", "dark", "light"],
    ["dark", "light", "dark"],
  ];

  it.each(cases)(
    "AC-11.5 resolveColorScheme(%s, %s) → %s",
    (preference, system, expected) => {
      expect(resolveColorScheme(preference, system)).toBe(expected);
    }
  );

  it("AC-11.5 선호가 system이고 시스템 값이 undefined(useColorScheme 미확정)여도 light다", () => {
    expect(resolveColorScheme("system", undefined)).toBe("light");
  });
});

// 지원(G-5 · 설계서 §5.4a): 저장값 코덱(P4)·ThemeSelector 옵션 순서(P10)가 쓰는 가드와 상수
describe("G-5 themePreference 가드", () => {
  it("G-5 THEME_PREFERENCES는 system, light, dark 순서의 3개다", () => {
    expect(THEME_PREFERENCES).toEqual(["system", "light", "dark"]);
  });

  it.each(["system", "light", "dark"])(
    "G-5 isThemePreference(%j) → true",
    (value) => {
      expect(isThemePreference(value)).toBe(true);
    }
  );

  it.each(["blue", "", null, undefined, 0, {}, ["light"]])(
    "G-5 isThemePreference(%j) → false",
    (value) => {
      expect(isThemePreference(value)).toBe(false);
    }
  );
});
