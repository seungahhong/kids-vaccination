import { renderHook } from "@testing-library/react-native";

import { useDocumentLanguage } from "@/hooks/useDocumentLanguage";
import { useDocumentLanguage as useWebDocumentLanguage } from "@/hooks/useDocumentLanguage.web";
import type { Locale } from "@/types";

// SEO 보조 테스트(AC 판정 아님, frontend-guidelines 2-B): 문서 언어 동기화 훅.
// jest(네이티브 프리셋)는 '@/hooks/useDocumentLanguage'를 no-op .ts로 풀므로, 웹 구현은 경로에 .web을 붙여 직접 불러 검증한다.
// jest 환경에는 document가 없어 documentElement.lang·title만 가진 가짜 document를 테스트 동안만 전역에 둔다.
// 실제 브라우저에서의 동작(설정에서 언어 전환 → <html lang>)은 e2e/seo.spec.ts가 본다.

type FakeDocument = { documentElement: { lang: string }; title: string };

const TITLE_KO = "아기 예방접종 일정";
let fakeDocument: FakeDocument;

beforeEach(() => {
  fakeDocument = { documentElement: { lang: "ko" }, title: TITLE_KO };
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    writable: true,
    value: fakeDocument,
  });
});

afterEach(() => {
  Reflect.deleteProperty(globalThis, "document");
});

describe("SEO useDocumentLanguage", () => {
  it("SEO 웹 구현은 locale이 정해지거나 바뀔 때마다 html lang과 문서 제목(common.appName)을 그 언어로 맞춘다", async () => {
    const { rerender } = await renderHook(
      (props: { locale: Locale }) => useWebDocumentLanguage(props.locale),
      { initialProps: { locale: "en" } }
    );

    expect(fakeDocument.documentElement.lang).toBe("en");
    expect(fakeDocument.title).toBe("Baby Vaccination Schedule");

    const changes: readonly (readonly [Locale, string])[] = [
      ["ja", "赤ちゃん予防接種スケジュール"],
      ["zh", "宝宝疫苗接种日程"],
      ["ko", TITLE_KO],
    ];
    for (const [locale, title] of changes) {
      await rerender({ locale });
      expect(fakeDocument.documentElement.lang).toBe(locale);
      expect(fakeDocument.title).toBe(title);
    }
  });

  it("SEO 네이티브 구현(no-op)은 locale을 받아도 문서를 바꾸지 않는다", async () => {
    await renderHook(() => useDocumentLanguage("en"));

    expect(fakeDocument.documentElement.lang).toBe("ko");
    expect(fakeDocument.title).toBe(TITLE_KO);
  });
});

// R1-12 (리뷰 라운드 1): I18nProvider는 저장값 하이드레이션 전에는 null을 넘긴다(그때 locale은 기기 감지값이라 깜빡임의 원인).
describe("R1-12 useDocumentLanguage 하이드레이션 전(null)", () => {
  it("R1-12 웹 구현은 locale이 null이면 템플릿의 lang(ko)·제목을 그대로 두고, 언어가 정해지면 그 언어로 맞춘다", async () => {
    const { rerender } = await renderHook(
      (props: { locale: Locale | null }) =>
        useWebDocumentLanguage(props.locale),
      { initialProps: { locale: null } }
    );

    expect(fakeDocument.documentElement.lang).toBe("ko");
    expect(fakeDocument.title).toBe(TITLE_KO);

    await rerender({ locale: "ja" });

    expect(fakeDocument.documentElement.lang).toBe("ja");
    expect(fakeDocument.title).toBe("赤ちゃん予防接種スケジュール");
  });
});
