import AsyncStorage from "@react-native-async-storage/async-storage";

import { isIsoDate } from "@/lib/date";
import { isLocale } from "@/lib/locale";
import { isThemePreference } from "@/lib/themePreference";
import type { IsoDate, Locale, ThemePreference } from "@/types";

// 저장소 어댑터(설계서 §5.5). src/lib에서 유일하게 IO를 한다. 값은 원시 문자열이고(JSON 아님, §4.3) 손상 값은 "없음"으로 읽는다.

export const STORAGE_KEYS = {
  birthdate: "vaccination-app-birthdate",
  theme: "vaccination-app-theme",
  locale: "vaccination-app-locale",
} as const;
export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];

export interface KeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export const defaultStore: KeyValueStore = AsyncStorage;

export type Codec<T> = {
  readonly decode: (raw: string) => T | null;
  readonly encode: (value: T) => string;
};

/** 원시 문자열 값 코덱: 가드를 통과하면 그대로, 아니면 null로 읽고, 쓸 때는 그대로 쓴다 */
function stringCodec<T extends string>(
  isValid: (raw: string) => raw is T
): Codec<T> {
  return {
    decode: (raw) => (isValid(raw) ? raw : null),
    encode: (value) => value,
  };
}

export const birthdateCodec: Codec<IsoDate> = stringCodec(isIsoDate);
export const themeCodec: Codec<ThemePreference> =
  stringCodec(isThemePreference);
export const localeCodec: Codec<Locale> = stringCodec(isLocale);

type StorageOp = "get" | "set" | "remove";

/** 저장 실패 보고. 키를 별도 인자로 넘겨 테스트가 다른 라이브러리 경고와 구분할 수 있다(AC-18.3, AD-26) */
function reportStorageError(
  op: StorageOp,
  key: StorageKey,
  error: unknown
): void {
  if (__DEV__) {
    console.warn("[storage]", op, key, error);
  }
}

/** 값 없음·손상 값·읽기 실패는 null. 손상 값을 지우거나 덮어쓰지 않는다(AC-18.4). 절대 reject하지 않는다 */
export async function readValue<T>(
  key: StorageKey,
  codec: Codec<T>,
  store: KeyValueStore = defaultStore
): Promise<T | null> {
  try {
    const raw = await store.getItem(key);
    return typeof raw === "string" ? codec.decode(raw) : null;
  } catch (error) {
    reportStorageError("get", key, error);
    return null;
  }
}

// 키별 직렬 큐: 같은 키의 빠른 연속 쓰기·삭제가 호출 순서대로 끝나 마지막 호출이 최종값이 된다(설계서 §11).
// 큐에 들어가는 op은 모두 오류를 흡수하므로 체인이 reject 상태로 남지 않는다.
const queues = new Map<StorageKey, Promise<unknown>>();

function enqueue<T>(key: StorageKey, op: () => Promise<T>): Promise<T> {
  const previous = queues.get(key) ?? Promise.resolve();
  const next = previous.then(op);
  queues.set(key, next);
  return next;
}

/** 성공 true, 실패 false. 키별 직렬 큐, 절대 reject하지 않는다(AC-18.3) */
export function writeValue<T>(
  key: StorageKey,
  codec: Codec<T>,
  value: T,
  store: KeyValueStore = defaultStore
): Promise<boolean> {
  return enqueue(key, async () => {
    try {
      await store.setItem(key, codec.encode(value));
      return true;
    } catch (error) {
      reportStorageError("set", key, error);
      return false;
    }
  });
}

/** 성공 true, 실패 false. 키별 직렬 큐, 절대 reject하지 않는다 */
export function removeValue(
  key: StorageKey,
  store: KeyValueStore = defaultStore
): Promise<boolean> {
  return enqueue(key, async () => {
    try {
      await store.removeItem(key);
      return true;
    } catch (error) {
      reportStorageError("remove", key, error);
      return false;
    }
  });
}
