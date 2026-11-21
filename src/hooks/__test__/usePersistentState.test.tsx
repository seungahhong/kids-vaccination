import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, renderHook, waitFor } from "@testing-library/react-native";

import { usePersistentState } from "@/hooks/usePersistentState";
import { isIsoDate } from "@/lib/date";
import {
  type Codec,
  localeCodec,
  STORAGE_KEYS,
  type StorageKey,
  themeCodec,
} from "@/lib/storage";
import type { IsoDate } from "@/types";

import {
  deferStorage,
  flushMacrotask,
  seedStorage,
} from "../../../test-utils/render";

/**
 * 원시 'YYYY-MM-DD' 코덱(v1.6까지의 birthdateCodec과 같은 동작). 훅은 키·코덱에 무관하므로 예전 생년월일 키를 예시로 쓴다.
 * 제품의 생년월일은 v1.7부터 아이 목록 JSON(ChildrenContext) 안에 있다(FR-16)
 */
const birthdateCodec: Codec<IsoDate> = {
  decode: (raw) => (isIsoDate(raw) ? raw : null),
  encode: (value) => value,
};

// 지원(설계서 §5.6·§6.1): usePersistentState는 마운트 시 1회 읽고, 읽기가 끝나면 isReady=true가 된다.
describe("G-5 usePersistentState 하이드레이션", () => {
  it("G-5 읽기가 끝나기 전에는 isReady=false·value=null이고, 저장값이 도착하면 isReady=true·value=저장값이다", async () => {
    const storage = deferStorage([STORAGE_KEYS.theme]);

    const { result } = await renderHook(() =>
      usePersistentState(STORAGE_KEYS.theme, themeCodec)
    );

    expect(result.current.isReady).toBe(false);
    expect(result.current.value).toBeNull();
    expect(AsyncStorage.getItem).toHaveBeenCalledWith(STORAGE_KEYS.theme);

    await storage.resolve(STORAGE_KEYS.theme, "dark");

    expect(result.current.isReady).toBe(true);
    expect(result.current.value).toBe("dark");
  });

  it("G-5 저장값이 없으면 isReady=true·value=null이다", async () => {
    const storage = deferStorage([STORAGE_KEYS.theme]);

    const { result } = await renderHook(() =>
      usePersistentState(STORAGE_KEYS.theme, themeCodec)
    );
    await storage.resolve(STORAGE_KEYS.theme, null);

    expect(result.current.isReady).toBe(true);
    expect(result.current.value).toBeNull();
  });
});

// 지원(설계서 §2.3 데이터 흐름): setValue는 동기 상태 갱신 + 비동기 저장, clearValue는 동기 null + 비동기 removeItem.
describe("G-5 usePersistentState setValue / clearValue", () => {
  it("G-5 setValue는 메모리 상태를 즉시 바꾸고 AsyncStorage에 원시 문자열로 저장한다", async () => {
    const { result } = await renderHook(() =>
      usePersistentState(STORAGE_KEYS.theme, themeCodec)
    );
    await waitFor(() => expect(result.current.isReady).toBe(true));

    await act(async () => {
      result.current.setValue("dark");
    });

    expect(result.current.value).toBe("dark");
    await flushMacrotask();
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      STORAGE_KEYS.theme,
      "dark"
    );
    expect(await AsyncStorage.getItem(STORAGE_KEYS.theme)).toBe("dark");
  });

  it("G-5 clearValue는 메모리 상태를 즉시 null로 바꾸고 저장소에서 키를 지운다", async () => {
    await seedStorage({ [STORAGE_KEYS.birthdate]: "2024-01-31" });
    const { result } = await renderHook(() =>
      usePersistentState(STORAGE_KEYS.birthdate, birthdateCodec)
    );
    await waitFor(() => expect(result.current.value).toBe("2024-01-31"));

    await act(async () => {
      result.current.clearValue();
    });

    expect(result.current.value).toBeNull();
    expect(result.current.isReady).toBe(true);
    await flushMacrotask();
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith(
      STORAGE_KEYS.birthdate
    );
    expect(await AsyncStorage.getItem(STORAGE_KEYS.birthdate)).toBeNull();
  });

  it("G-5 setValue·clearValue 참조는 재렌더 사이에 안정적이다(useCallback)", async () => {
    const { result } = await renderHook(() =>
      usePersistentState(STORAGE_KEYS.theme, themeCodec)
    );
    await waitFor(() => expect(result.current.isReady).toBe(true));
    const { setValue, clearValue } = result.current;

    await act(async () => {
      result.current.setValue("light");
    });

    expect(result.current.value).toBe("light");
    expect(result.current.setValue).toBe(setValue);
    expect(result.current.clearValue).toBe(clearValue);
  });
});

// 지원(설계서 §5.6 규칙 (2)·§11): 하이드레이션이 끝나기 전의 사용자 입력이 늦게 도착한 읽기 결과보다 우선한다.
describe("G-5 usePersistentState 하이드레이션 경합", () => {
  it("G-5 읽기가 끝나기 전에 setValue하면 늦게 도착한 저장값이 입력을 덮어쓰지 않고 isReady만 true가 된다", async () => {
    const storage = deferStorage([STORAGE_KEYS.theme]);
    const { result } = await renderHook(() =>
      usePersistentState(STORAGE_KEYS.theme, themeCodec)
    );
    expect(result.current.isReady).toBe(false);

    await act(async () => {
      result.current.setValue("light");
    });
    expect(result.current.value).toBe("light");
    expect(result.current.isReady).toBe(false);

    await storage.resolve(STORAGE_KEYS.theme, "dark");

    expect(result.current.isReady).toBe(true);
    expect(result.current.value).toBe("light");
  });

  it("G-5 읽기가 끝나기 전에 clearValue하면 늦게 도착한 저장값이 null을 덮어쓰지 않는다", async () => {
    const storage = deferStorage([STORAGE_KEYS.birthdate]);
    const { result } = await renderHook(() =>
      usePersistentState(STORAGE_KEYS.birthdate, birthdateCodec)
    );

    await act(async () => {
      result.current.clearValue();
    });
    await storage.resolve(STORAGE_KEYS.birthdate, "2024-01-31");

    expect(result.current.isReady).toBe(true);
    expect(result.current.value).toBeNull();
  });
});

// AC-18.4 (US-18) 훅 수준: 유효하지 않은 저장값은 미저장으로 간주한다(null·isReady=true). 덮어쓰지 않는다(setItem 0회).
describe("AC-18.4 [hook] 유효하지 않은 저장값", () => {
  /** 테스트가 읽는 필드만 가진 훅 시그니처(코덱별 PersistentState<T>를 하나의 타입으로 받기 위함) */
  type HydratedSubject = () => {
    readonly value: string | null;
    readonly isReady: boolean;
  };
  const cases: readonly {
    key: StorageKey;
    raw: string;
    useSubject: HydratedSubject;
  }[] = [
    {
      key: STORAGE_KEYS.theme,
      raw: "blue",
      useSubject: () => usePersistentState(STORAGE_KEYS.theme, themeCodec),
    },
    {
      key: STORAGE_KEYS.locale,
      raw: "fr",
      useSubject: () => usePersistentState(STORAGE_KEYS.locale, localeCodec),
    },
    {
      key: STORAGE_KEYS.birthdate,
      raw: "2024-02-30",
      useSubject: () =>
        usePersistentState(STORAGE_KEYS.birthdate, birthdateCodec),
    },
  ];

  it.each(cases)(
    "AC-18.4 [hook] $key에 저장된 $raw는 null로 하이드레이션되고 setItem·removeItem은 0회다",
    async ({ key, raw, useSubject }) => {
      await seedStorage({ [key]: raw });

      const { result } = await renderHook(useSubject);
      await waitFor(() => expect(result.current.isReady).toBe(true));

      expect(result.current.value).toBeNull();
      expect(AsyncStorage.setItem).not.toHaveBeenCalled();
      expect(AsyncStorage.removeItem).not.toHaveBeenCalled();
      expect(await AsyncStorage.getItem(key)).toBe(raw);
    }
  );
});

// AC-18.3 (US-18) 지원 — 훅 수준(설계서 §9.9): 쓰기 실패 시 메모리 상태 유지, reject 미전파. 화면 수준 판정은 P10 settings.test.tsx.
describe("AC-18.3 [hook] 쓰기 실패", () => {
  it("AC-18.3 [hook] setItem이 항상 reject해도 setValue한 값은 유지되고 console.error 0회, 키를 담은 console.warn 1회 이상이며 테스트가 실패 없이 끝난다", async () => {
    const error = jest.spyOn(console, "error").mockImplementation(() => {});
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    jest
      .mocked(AsyncStorage.setItem)
      .mockRejectedValue(new Error("setItem always fails"));

    const { result } = await renderHook(() =>
      usePersistentState(STORAGE_KEYS.locale, localeCodec)
    );
    await waitFor(() => expect(result.current.isReady).toBe(true));

    await act(async () => {
      result.current.setValue("en");
    });
    await flushMacrotask();

    expect(result.current.value).toBe("en");
    expect(result.current.isReady).toBe(true);
    expect(error).not.toHaveBeenCalled();
    const keyWarnings = warn.mock.calls.filter((args) =>
      args.includes("vaccination-app-locale")
    );
    expect(keyWarnings.length).toBeGreaterThanOrEqual(1);
  });

  it("AC-18.3 [hook] removeItem이 reject해도 clearValue한 null은 유지되고 console.error 0회다", async () => {
    const error = jest.spyOn(console, "error").mockImplementation(() => {});
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    await seedStorage({ [STORAGE_KEYS.birthdate]: "2024-01-31" });
    jest
      .mocked(AsyncStorage.removeItem)
      .mockRejectedValue(new Error("removeItem always fails"));

    const { result } = await renderHook(() =>
      usePersistentState(STORAGE_KEYS.birthdate, birthdateCodec)
    );
    await waitFor(() => expect(result.current.value).toBe("2024-01-31"));

    await act(async () => {
      result.current.clearValue();
    });
    await flushMacrotask();

    expect(result.current.value).toBeNull();
    expect(error).not.toHaveBeenCalled();
    expect(
      warn.mock.calls.some((args) => args.includes("vaccination-app-birthdate"))
    ).toBe(true);
  });
});

// 지원(설계서 §5.6 규칙 (1)·§11): 언마운트 뒤 도착한 읽기 결과는 버린다 — 경고·오류 0.
// 계약 테스트다(R1-10): React 18+는 언마운트된 컴포넌트의 setState를 경고 없이 버리므로, 이 테스트는 가드(`if (!active) return;`)를
// 지워도 통과한다. 언마운트 경로에서는 가드의 효과를 관찰할 수 없어 "콘솔 경고·오류 0"만 고정하고,
// 같은 가드(effect 정리 함수가 내리는 active)의 관찰 가능한 효과는 아래 R1-10 테스트가 key 전환으로 확인한다.
describe("G-5 usePersistentState 언마운트 가드", () => {
  it("G-5 읽기가 끝나기 전에 언마운트하고 나중에 resolve해도 console.error·console.warn이 0회다", async () => {
    const error = jest.spyOn(console, "error").mockImplementation(() => {});
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const storage = deferStorage([STORAGE_KEYS.theme]);
    const { result, unmount } = await renderHook(() =>
      usePersistentState(STORAGE_KEYS.theme, themeCodec)
    );
    const last = result.current;

    await unmount();
    await storage.resolve(STORAGE_KEYS.theme, "dark");
    await flushMacrotask();

    expect(result.current).toBe(last);
    expect(error).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });
});

/** 시험용 코덱: 원시 문자열을 그대로 읽고 쓴다. 모듈 상수라 의존성 배열이 안정적이다(key만 바꿔 effect를 다시 돌린다) */
const RAW_CODEC: Codec<string> = {
  decode: (raw) => raw,
  encode: (value) => value,
};

// R1-10 (리뷰 라운드 1): 읽기 effect의 정리 함수가 active를 내리면, 그 effect가 시작한 읽기의 늦은 결과는 버려져야 한다.
// key가 바뀌면 이전 effect가 정리되고 새 key를 읽는다. 가드가 없으면 늦게 도착한 이전 key의 값이 새 key의 값·isReady를 덮어쓴다.
describe("R1-10 usePersistentState 정리 가드(관찰 가능한 경로)", () => {
  it("R1-10 이전 key의 읽기가 끝나기 전에 key가 바뀌면, 새 key 값이 반영된 뒤 늦게 도착한 이전 key의 값은 버려진다(value·isReady 유지)", async () => {
    const storage = deferStorage([STORAGE_KEYS.theme, STORAGE_KEYS.locale]);
    const { result, rerender } = await renderHook(
      (props: { storageKey: StorageKey }) =>
        usePersistentState(props.storageKey, RAW_CODEC),
      { initialProps: { storageKey: STORAGE_KEYS.theme } }
    );

    await rerender({ storageKey: STORAGE_KEYS.locale });
    expect(AsyncStorage.getItem).toHaveBeenCalledWith(STORAGE_KEYS.locale);

    await storage.resolve(STORAGE_KEYS.locale, "ja");
    expect(result.current.value).toBe("ja");
    expect(result.current.isReady).toBe(true);

    // 정리된 첫 effect(theme)의 읽기가 이제 끝난다 → 버려져야 한다
    await storage.resolve(STORAGE_KEYS.theme, "dark");
    await flushMacrotask();

    expect(result.current.value).toBe("ja");
    expect(result.current.isReady).toBe(true);
  });
});
