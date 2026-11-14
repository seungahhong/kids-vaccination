import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";

import { BirthdateProvider, useBirthdate } from "@/contexts/BirthdateContext";
import { toIsoDate } from "@/lib/date";
import { STORAGE_KEYS } from "@/lib/storage";

import {
  deferStorage,
  flushMacrotask,
  seedStorage,
} from "../../../test-utils/render";

function Wrapper({ children }: { children: ReactNode }) {
  return <BirthdateProvider>{children}</BirthdateProvider>;
}

// AC-18.4 (US-18) 생년월일: 손상 저장값은 useBirthdate().birthdate === null(isReady === true)이고 덮어쓰지 않는다(setItem 0회).
describe("AC-18.4 BirthdateProvider 하이드레이션 — 손상 저장값", () => {
  it.each(["2024-02-30", "abc"])(
    "AC-18.4 저장값 %j → useBirthdate().birthdate === null, isReady === true, setItem 0회, 저장값 그대로",
    async (raw) => {
      await seedStorage({ [STORAGE_KEYS.birthdate]: raw });

      const { result } = await renderHook(() => useBirthdate(), {
        wrapper: Wrapper,
      });
      await waitFor(() => expect(result.current.isReady).toBe(true));

      expect(result.current.birthdate).toBeNull();
      expect(AsyncStorage.setItem).not.toHaveBeenCalled();
      expect(AsyncStorage.removeItem).not.toHaveBeenCalled();
      expect(await AsyncStorage.getItem(STORAGE_KEYS.birthdate)).toBe(raw);
    }
  );

  it("AC-18.4 유효한 저장값 '2024-01-31'은 그대로 하이드레이션된다", async () => {
    await seedStorage({ [STORAGE_KEYS.birthdate]: "2024-01-31" });

    const { result } = await renderHook(() => useBirthdate(), {
      wrapper: Wrapper,
    });
    await waitFor(() => expect(result.current.isReady).toBe(true));

    expect(result.current.birthdate).toBe("2024-01-31");
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });
});

// 지원(설계서 §5.7): 생년월일 상태 — isReady, setBirthdate(IsoDate) 저장, clearBirthdate 삭제, Provider 밖 사용 금지.
describe("G-5 BirthdateContext 생년월일 상태", () => {
  it("G-5 읽기 전에는 isReady=false·birthdate=null이고, 저장값이 없으면 isReady=true·birthdate=null이다", async () => {
    const storage = deferStorage([STORAGE_KEYS.birthdate]);
    const { result } = await renderHook(() => useBirthdate(), {
      wrapper: Wrapper,
    });

    expect(result.current.isReady).toBe(false);
    expect(result.current.birthdate).toBeNull();

    await storage.resolve(STORAGE_KEYS.birthdate, null);

    expect(result.current.isReady).toBe(true);
    expect(result.current.birthdate).toBeNull();
  });

  it("G-5 setBirthdate(IsoDate)는 birthdate를 즉시 바꾸고 vaccination-app-birthdate에 원시 문자열로 저장한다", async () => {
    const { result } = await renderHook(() => useBirthdate(), {
      wrapper: Wrapper,
    });
    await waitFor(() => expect(result.current.isReady).toBe(true));

    await act(async () => {
      result.current.setBirthdate(toIsoDate(new Date(2024, 0, 31)));
    });

    expect(result.current.birthdate).toBe("2024-01-31");
    await flushMacrotask();
    expect(await AsyncStorage.getItem("vaccination-app-birthdate")).toBe(
      "2024-01-31"
    );
  });

  it("G-5 clearBirthdate는 birthdate를 null로 바꾸고 저장소에서 키를 지운다", async () => {
    await seedStorage({ [STORAGE_KEYS.birthdate]: "2024-01-31" });
    const { result } = await renderHook(() => useBirthdate(), {
      wrapper: Wrapper,
    });
    await waitFor(() => expect(result.current.birthdate).toBe("2024-01-31"));

    await act(async () => {
      result.current.clearBirthdate();
    });

    expect(result.current.birthdate).toBeNull();
    expect(result.current.isReady).toBe(true);
    await flushMacrotask();
    expect(await AsyncStorage.getItem(STORAGE_KEYS.birthdate)).toBeNull();
  });

  it("G-5 Context 값은 상태가 바뀌지 않으면 같은 참조이고 setter는 안정적이다(useMemo·useCallback)", async () => {
    const { result, rerender } = await renderHook(() => useBirthdate(), {
      wrapper: Wrapper,
    });
    await waitFor(() => expect(result.current.isReady).toBe(true));
    const first = result.current;

    await rerender(undefined);

    expect(result.current).toBe(first);
    expect(result.current.setBirthdate).toBe(first.setBirthdate);
    expect(result.current.clearBirthdate).toBe(first.clearBirthdate);
  });

  it("G-5 useBirthdate를 BirthdateProvider 밖에서 쓰면 throw한다", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});

    await expect(renderHook(() => useBirthdate())).rejects.toThrow(
      /BirthdateProvider/
    );
  });
});
