import type { Locale } from "@/types";

// 문서 언어 동기화 훅의 공용 시그니처(설계서 §7.1의 플랫폼 확장자 분기, BirthdatePicker.types.ts와 같은 방식).
// tsc는 '@/hooks/useDocumentLanguage' import를 네이티브 .ts로만 풀어 호출부를 검사한다. 그래서 .ts와 .web.ts가 모두
// 이 타입으로 선언해, 웹 구현의 시그니처가 갈라지면 구현 파일에서 컴파일 오류가 나게 한다(리뷰 R1-15).

/**
 * 현재 표시 언어를 문서(<html lang>)에 반영한다. 문서 제목은 화면별로 useScreenDocument가 정한다(리뷰 R4-03).
 * null이면 아직 언어가 정해지지 않은 것(저장값 하이드레이션 전)이므로 문서를 그대로 둔다(리뷰 R1-12).
 */
export type UseDocumentLanguage = (locale: Locale | null) => void;
