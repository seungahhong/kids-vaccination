import AsyncStorage from "@react-native-async-storage/async-storage";

import { toIsoDate } from "@/lib/date";
import {
  birthdateCodec,
  localeCodec,
  readValue,
  removeValue,
  STORAGE_KEYS,
  themeCodec,
  writeValue,
} from "@/lib/storage";

// AC-18.1 (FR-01·08·09·10 · US-18): 저장소 수준. 빈 AsyncStorage mock에 키 3개가 원시 문자열로 저장된다(JSON 따옴표 없음, 설계서 §4.3).
describe("AC-18.1 저장소 API writeValue — 키 3개·원시 문자열", () => {
  it("AC-18.1 writeValue 3종이 모두 true를 반환하고 getAllKeys가 정확히 키 3개를 반환하며 값은 원시 문자열이다", async () => {
    expect(await AsyncStorage.getAllKeys()).toEqual([]);

    const birthdateWritten = await writeValue(
      STORAGE_KEYS.birthdate,
      birthdateCodec,
      toIsoDate(new Date(2024, 0, 31))
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

    expect([birthdateWritten, themeWritten, localeWritten]).toEqual([
      true,
      true,
      true,
    ]);

    const keys = [...(await AsyncStorage.getAllKeys())].sort();
    expect(keys).toEqual([
      "vaccination-app-birthdate",
      "vaccination-app-locale",
      "vaccination-app-theme",
    ]);

    expect(await AsyncStorage.getItem("vaccination-app-birthdate")).toBe(
      "2024-01-31"
    );
    expect(await AsyncStorage.getItem("vaccination-app-theme")).toBe("dark");
    expect(await AsyncStorage.getItem("vaccination-app-locale")).toBe("en");
  });

  it("AC-18.1 STORAGE_KEYS는 birthdate/theme/locale 3개이며 값이 vaccination-app-* 문자열이다", () => {
    expect(STORAGE_KEYS).toEqual({
      birthdate: "vaccination-app-birthdate",
      theme: "vaccination-app-theme",
      locale: "vaccination-app-locale",
    });
  });
});

// AC-18.4 (US-18) 코덱 수준: 손상 값은 decode가 null을 돌려주고 readValue는 "값 없음"으로 읽으며 덮어쓰지 않는다(설계서 §4.3).
describe("AC-18.4 코덱 decode — 손상 값은 null", () => {
  it.each(["2024-02-30", "abc", "", "2024-1-31", "20240131"])(
    "AC-18.4 birthdateCodec.decode(%j)는 null이다",
    (raw) => {
      expect(birthdateCodec.decode(raw)).toBeNull();
    }
  );

  it("AC-18.4 birthdateCodec은 유효한 'YYYY-MM-DD'를 그대로 돌려주고 encode는 원시 문자열이다", () => {
    const iso = toIsoDate(new Date(2024, 0, 31));
    expect(birthdateCodec.decode("2024-01-31")).toBe("2024-01-31");
    expect(birthdateCodec.encode(iso)).toBe("2024-01-31");
  });

  it.each(["blue", "", "SYSTEM", "auto"])(
    "AC-18.4 themeCodec.decode(%j)는 null이다",
    (raw) => {
      expect(themeCodec.decode(raw)).toBeNull();
    }
  );

  it.each(["system", "light", "dark"] as const)(
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
    "AC-18.4 저장된 생년월일 %j는 null로 읽히고 setItem·removeItem은 호출되지 않는다",
    async (raw) => {
      await AsyncStorage.multiSet([[STORAGE_KEYS.birthdate, raw]]);
      jest.mocked(AsyncStorage.setItem).mockClear();
      jest.mocked(AsyncStorage.removeItem).mockClear();

      expect(
        await readValue(STORAGE_KEYS.birthdate, birthdateCodec)
      ).toBeNull();

      expect(AsyncStorage.setItem).not.toHaveBeenCalled();
      expect(AsyncStorage.removeItem).not.toHaveBeenCalled();
      expect(await AsyncStorage.getItem(STORAGE_KEYS.birthdate)).toBe(raw);
    }
  );

  it("AC-18.4 값이 없으면 null이다", async () => {
    expect(await readValue(STORAGE_KEYS.theme, themeCodec)).toBeNull();
  });

  it("AC-18.4 유효한 값은 디코드되어 돌아온다(생년월일·테마·언어)", async () => {
    await AsyncStorage.multiSet([
      [STORAGE_KEYS.birthdate, "2024-01-31"],
      [STORAGE_KEYS.theme, "dark"],
      [STORAGE_KEYS.locale, "en"],
    ]);

    expect(await readValue(STORAGE_KEYS.birthdate, birthdateCodec)).toBe(
      "2024-01-31"
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
      readValue(STORAGE_KEYS.birthdate, birthdateCodec)
    ).resolves.toBeNull();

    expect(warn).toHaveBeenCalledWith(
      "[storage]",
      "get",
      "vaccination-app-birthdate",
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
