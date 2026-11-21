import AsyncStorage from "@react-native-async-storage/async-storage";

import { encodeChildren, isChildId } from "@/lib/children";
import { toIsoDate } from "@/lib/date";
import {
  childrenCodec,
  commitChildrenMigration,
  type KeyValueStore,
  loadChildren,
  localeCodec,
  readValue,
  removeValue,
  STORAGE_KEYS,
  themeCodec,
  writeValue,
} from "@/lib/storage";
import type { ChildId, ChildrenState } from "@/types";

/** 유효한 아이 id(테스트 입력) */
function childId(value: string): ChildId {
  if (!isChildId(value)) throw new Error(`아이 id 형식이 아니다: ${value}`);
  return value;
}

/** 이름 있는 아이 1명(2024-01-31, hepb-1 완료) */
const ONE_CHILD: ChildrenState = {
  activeId: childId("c1"),
  children: [
    {
      id: childId("c1"),
      name: "첫째",
      birthdate: toIsoDate(new Date(2024, 0, 31)),
      completed: ["hepb-1"],
    },
  ],
};

// AC-18.1 (FR-01·08·09·10·16 · US-18): 저장소 수준. 빈 AsyncStorage mock에 키 3개가 저장된다. 테마·언어는 원시 문자열(설계서 §4.3),
// 아이 목록은 버전이 붙은 JSON이다(v1.7 U-29, v1.6까지는 생년월일 원시 문자열 키).
describe("AC-18.1 저장소 API writeValue — 키 3개", () => {
  it("AC-18.1 writeValue 3종이 모두 true를 반환하고 getAllKeys가 정확히 키 3개를 반환하며 테마·언어는 원시 문자열, 아이 목록은 JSON이다", async () => {
    expect(await AsyncStorage.getAllKeys()).toEqual([]);

    const childrenWritten = await writeValue(
      STORAGE_KEYS.children,
      childrenCodec,
      ONE_CHILD
    );
    const themeWritten = await writeValue(
      STORAGE_KEYS.theme,
      themeCodec,
      "dark"
    );
    const localeWritten = await writeValue(
      STORAGE_KEYS.locale,
      localeCodec,
      "en"
    );

    expect([childrenWritten, themeWritten, localeWritten]).toEqual([
      true,
      true,
      true,
    ]);

    const keys = [...(await AsyncStorage.getAllKeys())].sort();
    expect(keys).toEqual([
      "vaccination-app-children",
      "vaccination-app-locale",
      "vaccination-app-theme",
    ]);

    expect(await AsyncStorage.getItem("vaccination-app-children")).toBe(
      encodeChildren(ONE_CHILD)
    );
    expect(await AsyncStorage.getItem("vaccination-app-theme")).toBe("dark");
    expect(await AsyncStorage.getItem("vaccination-app-locale")).toBe("en");
  });

  it("AC-18.1 STORAGE_KEYS는 theme/locale/children 3개 + 이전용 예전 키 birthdate·completed 2개이며 값이 vaccination-app-* 문자열이다", () => {
    expect(STORAGE_KEYS).toEqual({
      birthdate: "vaccination-app-birthdate",
      theme: "vaccination-app-theme",
      locale: "vaccination-app-locale",
      completed: "vaccination-app-completed",
      children: "vaccination-app-children",
    });
  });
});

// AC-18.4 (US-18) 코덱 수준: 손상 값은 decode가 null을 돌려주고 readValue는 "값 없음"으로 읽으며 덮어쓰지 않는다(설계서 §4.3).
describe("AC-18.4 코덱 decode — 손상 값은 null", () => {
  it.each(["2024-01-31", "abc", "", "{}", '{"v":1}'])(
    "AC-18.4 childrenCodec.decode(%j)는 null이다(아이 목록 JSON이 아님)",
    (raw) => {
      expect(childrenCodec.decode(raw)).toBeNull();
    }
  );

  it("AC-18.4 childrenCodec은 아이 목록을 JSON으로 왕복한다", () => {
    expect(childrenCodec.decode(childrenCodec.encode(ONE_CHILD))).toEqual(
      ONE_CHILD
    );
  });

  it.each(["blue", "", "SYSTEM", "auto", "system"])(
    "AC-18.4 themeCodec.decode(%j)는 null이다(예전 기본값 'system'도 U-24부터 '값 없음' → 기본값 라이트)",
    (raw) => {
      expect(themeCodec.decode(raw)).toBeNull();
    }
  );

  it.each(["light", "dark"] as const)(
    "AC-18.4 themeCodec은 %s를 왕복한다",
    (preference) => {
      expect(themeCodec.decode(preference)).toBe(preference);
      expect(themeCodec.encode(preference)).toBe(preference);
    }
  );

  it.each(["fr", "", "KO", "ko-KR"])(
    "AC-18.4 localeCodec.decode(%j)는 null이다",
    (raw) => {
      expect(localeCodec.decode(raw)).toBeNull();
    }
  );

  it.each(["ko", "en", "ja", "zh"] as const)(
    "AC-18.4 localeCodec은 %s를 왕복한다",
    (locale) => {
      expect(localeCodec.decode(locale)).toBe(locale);
      expect(localeCodec.encode(locale)).toBe(locale);
    }
  );
});

describe("AC-18.4 readValue — 손상 값은 null이고 덮어쓰지 않는다", () => {
  it.each(["2024-02-30", "abc"])(
    "AC-18.4 저장된 아이 목록 %j는 null로 읽히고 setItem·removeItem은 호출되지 않는다",
    async (raw) => {
      await AsyncStorage.multiSet([[STORAGE_KEYS.children, raw]]);
      jest.mocked(AsyncStorage.setItem).mockClear();
      jest.mocked(AsyncStorage.removeItem).mockClear();

      expect(await readValue(STORAGE_KEYS.children, childrenCodec)).toBeNull();

      expect(AsyncStorage.setItem).not.toHaveBeenCalled();
      expect(AsyncStorage.removeItem).not.toHaveBeenCalled();
      expect(await AsyncStorage.getItem(STORAGE_KEYS.children)).toBe(raw);
    }
  );

  it("AC-18.4 값이 없으면 null이다", async () => {
    expect(await readValue(STORAGE_KEYS.theme, themeCodec)).toBeNull();
  });

  it("AC-18.4 유효한 값은 디코드되어 돌아온다(아이 목록·테마·언어)", async () => {
    await AsyncStorage.multiSet([
      [STORAGE_KEYS.children, encodeChildren(ONE_CHILD)],
      [STORAGE_KEYS.theme, "dark"],
      [STORAGE_KEYS.locale, "en"],
    ]);

    expect(await readValue(STORAGE_KEYS.children, childrenCodec)).toEqual(
      ONE_CHILD
    );
    expect(await readValue(STORAGE_KEYS.theme, themeCodec)).toBe("dark");
    expect(await readValue(STORAGE_KEYS.locale, localeCodec)).toBe("en");
  });
});

// 지원(AC-18.2·18.3·설계서 §5.5·§11): 저장소 오류는 흡수된다 — 읽기 실패 null, 쓰기·삭제 실패 false, reject 없음.
// 보고는 __DEV__에서만 console.warn('[storage]', op, key, error) 형식이라 키 인자로 다른 경고와 구분할 수 있다(AD-26).
describe("AC-18.3 [storage] 오류 흡수와 reportStorageError", () => {
  it("AC-18.3 [storage] getItem이 reject하면 readValue는 null로 resolve하고 '[storage]', 'get', 키를 담아 warn한다", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const error = jest.spyOn(console, "error").mockImplementation(() => {});
    const failure = new Error("read failed");
    jest.mocked(AsyncStorage.getItem).mockRejectedValue(failure);

    await expect(
      readValue(STORAGE_KEYS.children, childrenCodec)
    ).resolves.toBeNull();

    expect(warn).toHaveBeenCalledWith(
      "[storage]",
      "get",
      "vaccination-app-children",
      failure
    );
    expect(error).not.toHaveBeenCalled();
  });

  it("AC-18.3 [storage] setItem이 reject하면 writeValue는 false로 resolve하고 인자 중 하나가 'vaccination-app-locale'인 warn을 1회 이상 남긴다", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const error = jest.spyOn(console, "error").mockImplementation(() => {});
    jest
      .mocked(AsyncStorage.setItem)
      .mockRejectedValue(new Error("write failed"));

    await expect(
      writeValue(STORAGE_KEYS.locale, localeCodec, "en")
    ).resolves.toBe(false);

    const keyWarnings = warn.mock.calls.filter((args) =>
      args.includes("vaccination-app-locale")
    );
    expect(keyWarnings.length).toBeGreaterThanOrEqual(1);
    expect(keyWarnings[0]?.[0]).toBe("[storage]");
    expect(keyWarnings[0]?.[1]).toBe("set");
    expect(error).not.toHaveBeenCalled();
  });

  it("AC-18.3 [storage] removeItem이 reject하면 removeValue는 false로 resolve하고 'remove'와 키를 담아 warn한다", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const failure = new Error("remove failed");
    jest.mocked(AsyncStorage.removeItem).mockRejectedValue(failure);

    await expect(removeValue(STORAGE_KEYS.theme)).resolves.toBe(false);

    expect(warn).toHaveBeenCalledWith(
      "[storage]",
      "remove",
      "vaccination-app-theme",
      failure
    );
  });

  it("AC-18.3 [storage] 저장소 메서드가 동기적으로 throw해도 reject하지 않는다", async () => {
    jest.spyOn(console, "warn").mockImplementation(() => {});
    const throwing = {
      getItem: () => {
        throw new Error("sync get");
      },
      setItem: () => {
        throw new Error("sync set");
      },
      removeItem: () => {
        throw new Error("sync remove");
      },
    };

    await expect(
      readValue(STORAGE_KEYS.theme, themeCodec, throwing)
    ).resolves.toBeNull();
    await expect(
      writeValue(STORAGE_KEYS.theme, themeCodec, "dark", throwing)
    ).resolves.toBe(false);
    await expect(removeValue(STORAGE_KEYS.theme, throwing)).resolves.toBe(
      false
    );
  });

  it("AC-18.3 [storage] removeValue가 성공하면 true를 돌려주고 키가 사라진다", async () => {
    await AsyncStorage.multiSet([[STORAGE_KEYS.birthdate, "2024-01-31"]]);

    await expect(removeValue(STORAGE_KEYS.birthdate)).resolves.toBe(true);

    expect(await AsyncStorage.getItem(STORAGE_KEYS.birthdate)).toBeNull();
  });

  it("AC-18.3 [storage] __DEV__가 아니면 실패해도 warn하지 않는다(프로덕션 무음)", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    jest.mocked(AsyncStorage.getItem).mockRejectedValue(new Error("boom"));
    Reflect.set(globalThis, "__DEV__", false);
    try {
      await expect(
        readValue(STORAGE_KEYS.locale, localeCodec)
      ).resolves.toBeNull();
    } finally {
      Reflect.set(globalThis, "__DEV__", true);
    }

    expect(warn).not.toHaveBeenCalled();
  });
});

/** 값별로 완료 시간이 다른 가짜 저장소: 먼저 시작한 쓰기가 더 늦게 끝나는 상황을 만든다(설계서 §11) */
function createSlowStore(delaysMs: Readonly<Record<string, number>>) {
  const data = new Map<string, string>();
  const started: string[] = [];
  const completed: string[] = [];
  const wait = (ms: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, ms));
  const store = {
    async getItem(key: string) {
      return data.get(key) ?? null;
    },
    async setItem(key: string, value: string) {
      started.push(value);
      await wait(delaysMs[value] ?? 0);
      data.set(key, value);
      completed.push(value);
    },
    async removeItem(key: string) {
      started.push(`remove:${key}`);
      await wait(delaysMs[`remove:${key}`] ?? 0);
      data.delete(key);
      completed.push(`remove:${key}`);
    },
  };
  return { store, data, started, completed };
}

// 지원(설계서 §11 동시성·§5.5 키별 큐): 같은 키의 빠른 연속 저장은 호출 순서대로 끝나고 마지막 값이 최종값이다.
describe("G-5 storage 키별 쓰기 큐", () => {
  it("G-5 같은 키에 en→ja→zh를 연속 호출하면 먼저 시작한 쓰기가 느려도 호출 순서대로 끝나고 최종 저장값은 zh다", async () => {
    const { store, data, started, completed } = createSlowStore({
      en: 30,
      ja: 15,
      zh: 1,
    });

    const results = await Promise.all([
      writeValue(STORAGE_KEYS.locale, localeCodec, "en", store),
      writeValue(STORAGE_KEYS.locale, localeCodec, "ja", store),
      writeValue(STORAGE_KEYS.locale, localeCodec, "zh", store),
    ]);

    expect(results).toEqual([true, true, true]);
    expect(started).toEqual(["en", "ja", "zh"]);
    expect(completed).toEqual(["en", "ja", "zh"]);
    expect(data.get(STORAGE_KEYS.locale)).toBe("zh");
  });

  it("G-5 같은 키의 쓰기 뒤 removeValue는 쓰기가 끝난 뒤 실행되어 최종적으로 값이 없다", async () => {
    const { store, data, completed } = createSlowStore({ dark: 20 });

    const [written, removed] = await Promise.all([
      writeValue(STORAGE_KEYS.theme, themeCodec, "dark", store),
      removeValue(STORAGE_KEYS.theme, store),
    ]);

    expect([written, removed]).toEqual([true, true]);
    expect(completed).toEqual(["dark", `remove:${STORAGE_KEYS.theme}`]);
    expect(data.has(STORAGE_KEYS.theme)).toBe(false);
  });

  it("G-5 다른 키의 쓰기는 서로 기다리지 않는다(키별 큐)", async () => {
    const { store, completed } = createSlowStore({ dark: 30, en: 1 });

    await Promise.all([
      writeValue(STORAGE_KEYS.theme, themeCodec, "dark", store),
      writeValue(STORAGE_KEYS.locale, localeCodec, "en", store),
    ]);

    expect(completed).toEqual(["en", "dark"]);
  });

  it("G-5 앞선 쓰기가 실패해도 같은 키의 다음 쓰기는 실행된다", async () => {
    jest.spyOn(console, "warn").mockImplementation(() => {});
    const { store, data, started } = createSlowStore({});
    const failing = {
      ...store,
      setItem: jest
        .fn(store.setItem)
        .mockRejectedValueOnce(new Error("first write failed")),
    };

    const results = await Promise.all([
      writeValue(STORAGE_KEYS.locale, localeCodec, "ja", failing),
      writeValue(STORAGE_KEYS.locale, localeCodec, "zh", failing),
    ]);

    expect(results).toEqual([false, true]);
    expect(started).toEqual(["zh"]);
    expect(data.get(STORAGE_KEYS.locale)).toBe("zh");
  });
});

// AC-21.7 (FR-16, U-29) 저장소 수준 이전: 새 키가 없을 때만 예전 생년월일·완료 키를 읽어 아이 1명으로 옮기고, 옮겨 쓴 뒤 예전 키를 지운다.
describe("AC-21.7 loadChildren·commitChildrenMigration", () => {
  it("AC-21.7 새 키가 있으면 그것을 읽고 예전 키는 읽지 않는다", async () => {
    await AsyncStorage.multiSet([
      [STORAGE_KEYS.children, encodeChildren(ONE_CHILD)],
      [STORAGE_KEYS.birthdate, "2026-04-30"],
    ]);
    jest.mocked(AsyncStorage.getItem).mockClear();

    expect(await loadChildren()).toEqual({ state: ONE_CHILD, migrated: false });
    expect(AsyncStorage.getItem).toHaveBeenCalledTimes(1);
  });

  it("AC-21.7 새 키가 없고 예전 생년월일이 있으면 아이 1명으로 옮길 상태(migrated)를 돌려주고, commitChildrenMigration은 새 키를 쓰고 예전 키 2개를 지운다", async () => {
    await AsyncStorage.multiSet([
      [STORAGE_KEYS.birthdate, "2026-04-30"],
      [STORAGE_KEYS.completed, "2026-04-30|hepb-3"],
    ]);

    const loaded = await loadChildren();

    expect(loaded.migrated).toBe(true);
    expect(loaded.state.children).toEqual([
      { id: "c1", birthdate: "2026-04-30", completed: ["hepb-3"] },
    ]);
    expect(await commitChildrenMigration(loaded.state)).toBe(true);
    expect(await AsyncStorage.getItem(STORAGE_KEYS.children)).toBe(
      encodeChildren(loaded.state)
    );
    expect(await AsyncStorage.getItem(STORAGE_KEYS.birthdate)).toBeNull();
    expect(await AsyncStorage.getItem(STORAGE_KEYS.completed)).toBeNull();
  });

  it("AC-21.7 새 키 쓰기가 실패하면 예전 키를 지우지 않고 false다", async () => {
    await AsyncStorage.multiSet([[STORAGE_KEYS.birthdate, "2026-04-30"]]);
    jest.spyOn(console, "warn").mockImplementation(() => {});
    jest.mocked(AsyncStorage.setItem).mockRejectedValueOnce(new Error("full"));
    const { state } = await loadChildren();

    expect(await commitChildrenMigration(state)).toBe(false);
    expect(await AsyncStorage.getItem(STORAGE_KEYS.birthdate)).toBe(
      "2026-04-30"
    );
  });

  it("AC-21.7 새 키 읽기가 실패하면 예전 키로 옮기지 않고 아이 없음이다(있을지 모르는 새 데이터를 덮어쓰지 않음). 예전 키 읽기 실패는 '없음'으로 본다", async () => {
    jest.spyOn(console, "warn").mockImplementation(() => {});
    const failingChildren: KeyValueStore = {
      getItem: (key) =>
        key === STORAGE_KEYS.children
          ? Promise.reject(new Error("broken"))
          : Promise.resolve("2026-04-30"),
      setItem: () => Promise.resolve(),
      removeItem: () => Promise.resolve(),
    };
    const failingLegacy: KeyValueStore = {
      getItem: (key) =>
        key === STORAGE_KEYS.children
          ? Promise.resolve(null)
          : Promise.reject(new Error("broken")),
      setItem: () => Promise.resolve(),
      removeItem: () => Promise.resolve(),
    };

    expect(await loadChildren(failingChildren)).toEqual({
      state: { activeId: null, children: [] },
      migrated: false,
    });
    expect(await loadChildren(failingLegacy)).toEqual({
      state: { activeId: null, children: [] },
      migrated: false,
    });
  });
});
