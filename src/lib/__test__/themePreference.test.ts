import {
  DEFAULT_THEME,
  isThemePreference,
  oppositeTheme,
  THEME_PREFERENCES,
} from "@/lib/themePreference";

// 테마 선호 순수 모듈(설계서 §5.4a). v1.5(U-24): "시스템"을 없애고 라이트로 합쳐 선택지는 라이트·다크 2개, 기본값 라이트다.
// OS 색 모드를 따르지 않는다는 Provider 수준 판정은 src/contexts/__test__/ThemeContext.test.tsx(AC-11.5)가 한다.
describe("G-5 themePreference 가드", () => {
  it("G-5 THEME_PREFERENCES는 light, dark 순서의 2개이고 기본값은 light다(U-24)", () => {
    expect(THEME_PREFERENCES).toEqual(["light", "dark"]);
    expect(DEFAULT_THEME).toBe("light");
  });

  it.each(["light", "dark"])("G-5 isThemePreference(%j) → true", (value) => {
    expect(isThemePreference(value)).toBe(true);
  });

  it.each(["system", "blue", "", null, undefined, 0, {}, ["light"]])(
    "G-5 isThemePreference(%j) → false(예전 'system'도 더는 유효한 선호가 아니다)",
    (value) => {
      expect(isThemePreference(value)).toBe(false);
    }
  );
});

describe("U-23 oppositeTheme(헤더 테마 스위치)", () => {
  it("U-23 light ↔ dark를 뒤집는다", () => {
    expect(oppositeTheme("light")).toBe("dark");
    expect(oppositeTheme("dark")).toBe("light");
  });
});
