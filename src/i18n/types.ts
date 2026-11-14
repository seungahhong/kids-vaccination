import type { Locale } from "@/types";

import type ko from "./messages/ko.json";

// 번역 키 타입(설계서 §4.4). 메시지 파일은 2단계(namespace.leaf) 고정이라 재귀 유니온 대신 템플릿 리터럴 매핑으로 만든다.
// ko.json이 기준 카탈로그다: 키를 더하거나 빼면 TranslationKey가 바뀌고, en/ja/zh는 translate.ts의 `satisfies Catalogs`가 맞춘다.

export type Messages = typeof ko;
export type Namespace = keyof Messages;
export type TranslationKey = {
  [N in Namespace]: `${N}.${keyof Messages[N] & string}`;
}[Namespace];
export type Catalogs = Readonly<Record<Locale, Messages>>;
