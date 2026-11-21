import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  decodeChildren,
  encodeChildren,
  NO_CHILDREN,
  resolveChildrenHydration,
} from "@/lib/children";
import { isLocale } from "@/lib/locale";
import { isThemePreference } from "@/lib/themePreference";
import type { ChildrenState, Locale, ThemePreference } from "@/types";

// 저장소 어댑터(설계서 §5.5). src/lib에서 유일하게 IO를 한다. 값은 원시 문자열이고(JSON 아님, §4.3) 손상 값은 "없음"으로 읽는다.

export const STORAGE_KEYS = {
  /** 예전(v1.6까지) 생년월일 하나. v1.7부터는 읽어서 children으로 옮긴 뒤 지운다(U-29) */
  birthdate: "vaccination-app-birthdate",
  theme: "vaccination-app-theme",
  locale: "vaccination-app-locale",
  /** 예전(v1.6까지) 접종 완료 기록 `${생년월일}|${id},…`. children으로 옮긴 뒤 지운다(U-29) */
  completed: "vaccination-app-completed",
  /** 저장된 아이 목록(FR-16, U-29). 이 키만 버전이 붙은 JSON이다(src/lib/children.ts) */
  children: "vaccination-app-children",
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

export const themeCodec: Codec<ThemePreference> =
  stringCodec(isThemePreference);
export const localeCodec: Codec<Locale> = stringCodec(isLocale);
/** 아이 목록 코덱. 형식은 src/lib/children.ts가 정하고, 손상 값은 null로 읽는다 */
export const childrenCodec: Codec<ChildrenState> = {
  decode: decodeChildren,
  encode: encodeChildren,
};

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

/** 원시 읽기 결과. ok false는 읽기 자체가 실패한 경우다(값 없음 null과 구분) */
type RawRead =
  | { readonly ok: true; readonly raw: string | null }
  | {
      readonly ok: false;
    };

/** 코덱 없이 원시 문자열을 읽는다. 실패는 ok false로 돌려주고 절대 reject하지 않는다 */
async function readRaw(
  key: StorageKey,
  store: KeyValueStore
): Promise<RawRead> {
  try {
    const raw = await store.getItem(key);
    return { ok: true, raw: typeof raw === "string" ? raw : null };
  } catch (error) {
    reportStorageError("get", key, error);
    return { ok: false };
  }
}

/**
 * 아이 목록 하이드레이션(FR-16, U-29). 새 키를 읽고, 새 키가 없을 때만 예전 생년월일·완료 키를 읽어 아이 1명으로 옮길지 정한다.
 * 새 키 읽기가 실패하면 예전 키로 옮기지 않는다(있을지 모르는 새 데이터를 덮어쓰지 않게). 옮겨 쓰는 일은 commitChildrenMigration이 한다.
 * 절대 reject하지 않는다.
 */
export async function loadChildren(
  store: KeyValueStore = defaultStore
): Promise<{ readonly state: ChildrenState; readonly migrated: boolean }> {
  const current = await readRaw(STORAGE_KEYS.children, store);
  if (!current.ok) return { state: NO_CHILDREN, migrated: false };
  if (current.raw !== null) {
    return resolveChildrenHydration(current.raw, null, null);
  }
  const [birthdate, completed] = await Promise.all([
    readRaw(STORAGE_KEYS.birthdate, store),
    readRaw(STORAGE_KEYS.completed, store),
  ]);
  return resolveChildrenHydration(
    null,
    birthdate.ok ? birthdate.raw : null,
    completed.ok ? completed.raw : null
  );
}

/**
 * 예전 키에서 옮긴 아이 목록을 새 키에 쓰고, 성공하면 예전 생년월일·완료 키를 지운다(U-29).
 * 예전 키를 남겨 두면 아이를 모두 지워 새 키가 없어졌을 때 지운 아이가 다시 살아나기 때문이다. 쓰기에 실패하면 예전 키를 그대로 둔다
 */
export async function commitChildrenMigration(
  state: ChildrenState,
  store: KeyValueStore = defaultStore
): Promise<boolean> {
  const written = await writeValue(
    STORAGE_KEYS.children,
    childrenCodec,
    state,
    store
  );
  if (!written) return false;
  await Promise.all([
    removeValue(STORAGE_KEYS.birthdate, store),
    removeValue(STORAGE_KEYS.completed, store),
  ]);
  return true;
}
