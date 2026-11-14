import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  type Codec,
  defaultStore,
  type KeyValueStore,
  readValue,
  removeValue,
  type StorageKey,
  writeValue,
} from "@/lib/storage";

// AsyncStorage 기반 상태(설계서 §5.6). 마운트 시 1회 읽고(isReady), 쓰기는 메모리 상태를 먼저 갱신한 뒤 비동기로 저장한다.

export type PersistentState<T> = {
  readonly value: T | null;
  readonly isReady: boolean;
  /** 동기 state 갱신 + 비동기 저장(실패해도 메모리 상태 유지, reject 없음) */
  readonly setValue: (next: T) => void;
  /** 동기 null + 비동기 removeItem */
  readonly clearValue: () => void;
};

/** codec·store는 모듈 상수여야 한다(의존성 배열 안정) */
export function usePersistentState<T>(
  key: StorageKey,
  codec: Codec<T>,
  store: KeyValueStore = defaultStore
): PersistentState<T> {
  const [value, setValueState] = useState<T | null>(null);
  const [isReady, setIsReady] = useState(false);
  // 하이드레이션 전에 사용자가 값을 바꿨으면 늦게 도착한 읽기 결과로 덮어쓰지 않는다(§11 하이드레이션 경합)
  const touchedRef = useRef(false);

  useEffect(() => {
    // 언마운트 뒤 도착한 읽기 결과는 버린다
    let active = true;
    void readValue(key, codec, store).then((stored) => {
      if (!active) return;
      if (!touchedRef.current) setValueState(stored);
      setIsReady(true);
    });
    return () => {
      active = false;
    };
  }, [key, codec, store]);

  const setValue = useCallback(
    (next: T) => {
      touchedRef.current = true;
      setValueState(next);
      void writeValue(key, codec, next, store);
    },
    [key, codec, store]
  );

  const clearValue = useCallback(() => {
    touchedRef.current = true;
    setValueState(null);
    void removeValue(key, store);
  }, [key, store]);

  return useMemo(
    () => ({ value, isReady, setValue, clearValue }),
    [value, isReady, setValue, clearValue]
  );
}
