import { getLocales } from "expo-localization";
import {
  createContext,
  type ReactElement,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

import { useDocumentLanguage } from "@/hooks/useDocumentLanguage";
import { usePersistentState } from "@/hooks/usePersistentState";
import { localize, translate } from "@/i18n/translate";
import type { TranslationKey } from "@/i18n/types";
import { detectLocale } from "@/lib/locale";
import { localeCodec, STORAGE_KEYS } from "@/lib/storage";
import type { Locale, LocalizedText } from "@/types";

// 언어 상태(설계서 §5.7·§6.3, 원본 I18nContext 이식). 초기 로케일 = 저장값(유효할 때) → 기기 첫 로케일 → ko.
// 감지값은 저장하지 않는다(P-03): 저장은 usePersistentState의 setValue를 부르는 setLocale만 한다.

export type I18nContextValue = {
  readonly locale: Locale;
  /** 사용자 선택만 저장한다(vaccination-app-locale, 원시 문자열) */
  readonly setLocale: (locale: Locale) => void;
  /** 타입 안전 번역 조회: 없는 키는 컴파일 오류다(TranslationKey) */
  readonly t: (key: TranslationKey) => string;
  /** 데이터의 다국어 텍스트에서 현재 로케일 값을 고른다 */
  readonly lt: (text: LocalizedText) => string;
  readonly isReady: boolean;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider(props: { children: ReactNode }): ReactElement {
  const {
    value,
    isReady,
    setValue: setLocale,
  } = usePersistentState(STORAGE_KEYS.locale, localeCodec);
  // 기기 로케일은 마운트 시 1회만 읽는다(getLocales). 손상 저장값은 codec이 null로 읽어 여기로 떨어진다(AC-18.4).
  const [deviceLocale] = useState<Locale>(() => detectLocale(getLocales()));
  const locale = value ?? deviceLocale;
  // 웹은 <html lang>·문서 제목을 현재 언어로 맞춘다(WCAG 3.1.1·SEO). 네이티브 구현은 no-op이다.
  // 하이드레이션 전의 locale은 기기 감지값이라, 그때 맞추면 저장 언어가 다를 때 두 번 바뀌며 깜빡인다 → isReady 뒤에만(R1-12)
  useDocumentLanguage(isReady ? locale : null);

  const t = useCallback(
    (key: TranslationKey): string => translate(locale, key),
    [locale]
  );
  const lt = useCallback(
    (text: LocalizedText): string => localize(text, locale),
    [locale]
  );

  const contextValue = useMemo<I18nContextValue>(
    () => ({ locale, setLocale, t, lt, isReady }),
    [locale, setLocale, t, lt, isReady]
  );

  return (
    <I18nContext.Provider value={contextValue}>
      {props.children}
    </I18nContext.Provider>
  );
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (context === null) {
    throw new Error("useI18n은 I18nProvider 안에서만 쓸 수 있습니다");
  }
  return context;
}
