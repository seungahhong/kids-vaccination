import type { UseDocumentLanguage } from "./useDocumentLanguage.types";

// 문서 언어 동기화의 네이티브 구현(no-op). iOS·Android에는 <html lang>이 없어 할 일이 없다.
// 웹 번들은 Metro가 같은 이름의 useDocumentLanguage.web.ts를 고른다(설계서 §7.1의 플랫폼 확장자 분기).
// 시그니처는 두 구현이 함께 쓰는 UseDocumentLanguage다(useDocumentLanguage.types.ts).

/** 웹에서만 현재 언어를 문서에 반영한다. 네이티브에서는 아무것도 하지 않는다 */
export const useDocumentLanguage: UseDocumentLanguage = (locale) => {
  // 의도적으로 쓰지 않는 인자다. 실행 문장이 0개인 파일은 커버리지 표에 0%로 찍히므로 문장 하나를 둔다
  void locale;
};
