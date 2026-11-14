import { useEffect } from "react";

import { translate } from "@/i18n/translate";

import type { UseDocumentLanguage } from "./useDocumentLanguage.types";

// 문서 언어 동기화의 웹 구현(SEO·WCAG 3.1.1 페이지 언어). Metro는 웹 번들에서 이 .web.ts를 고르고,
// iOS·Android와 jest는 같은 이름의 .ts(no-op)를 쓴다(BirthdatePicker와 같은 플랫폼 확장자 분기, 설계서 §7.1).
// 정적 템플릿 public/index.html은 기본 언어 ko로 시작한다. 언어가 정해지거나 바뀌면 <html lang>과
// 문서 제목(i18n common.appName)을 현재 언어로 맞춰 화면 읽기 프로그램의 발음 규칙과 검색엔진의 언어 판정이
// 실제 표시 언어를 따르게 한다. 언어가 아직 정해지지 않았으면(null, 하이드레이션 전) 템플릿 값을 그대로 둔다.

/** 현재 언어를 <html lang>과 document.title에 반영한다(null이면 그대로 둔다) */
export const useDocumentLanguage: UseDocumentLanguage = (locale) => {
  useEffect(() => {
    if (locale === null) return;
    document.documentElement.lang = locale;
    document.title = translate(locale, "common.appName");
  }, [locale]);
};
