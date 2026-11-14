import type { Locale, LocalizedText } from "@/types";

import en from "./messages/en.json";
import ja from "./messages/ja.json";
import ko from "./messages/ko.json";
import zh from "./messages/zh.json";
import type { Catalogs, TranslationKey } from "./types";

// 순수 번역 조회(설계서 §4.4). React·expo를 import하지 않는다(ESLint 순수 레이어).
// `satisfies Catalogs`: en/ja/zh에 ko.json의 키가 하나라도 없으면 컴파일 오류다(초과 키는 src/i18n/__test__/messages.test.ts가 잡는다).
export const CATALOGS = { ko, en, ja, zh } satisfies Catalogs;

type Catalog = Readonly<Record<string, Readonly<Record<string, string>>>>;

/** 로케일 카탈로그에서 `namespace.leaf` 키를 찾는다. 없는 leaf는 key를 그대로 돌려준다(타입상 도달 불가) */
export function translate(locale: Locale, key: TranslationKey): string {
  const dot = key.indexOf(".");
  const namespace = key.slice(0, dot);
  const leaf = key.slice(dot + 1);
  const catalog: Catalog = CATALOGS[locale];
  return catalog[namespace]?.[leaf] ?? key;
}

/** 데이터의 다국어 텍스트에서 현재 로케일 값을 고른다(lt의 순수 버전) */
export function localize(text: LocalizedText, locale: Locale): string {
  return text[locale];
}
