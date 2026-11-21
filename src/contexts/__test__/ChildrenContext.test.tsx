import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";

import { ChildrenProvider, useChildren } from "@/contexts/ChildrenContext";
import { encodeChildren, isChildId, MAX_CHILDREN } from "@/lib/children";
import { toIsoDate } from "@/lib/date";
import { STORAGE_KEYS } from "@/lib/storage";
import type { ChildId, ChildrenState } from "@/types";

import {
  day,
  deferStorage,
  flushMacrotask,
  seedStorage,
} from "../../../test-utils/render";

// 여러 아이 상태(FR-16, U-26~U-29). 저장은 vaccination-app-children 키 하나(검증된 JSON)이고, 예전 생년월일·완료 키는 처음 읽을 때
// 아이 1명으로 옮긴 뒤 지운다. 화면 수준 판정은 app/(tabs)/__test__/*.test.tsx와 E2E(AC-21.x)가 한다.

function Wrapper({ children }: { children: ReactNode }) {
  return <ChildrenProvider>{children}</ChildrenProvider>;
}

function childId(value: string): ChildId {
  if (!isChildId(value)) throw new Error(`아이 id 형식이 아니다: ${value}`);
  return value;
}

const iso = (value: string) => toIsoDate(day(value));

const TWO: ChildrenState = {
  activeId: childId("c2"),
  children: [
    {
      id: childId("c1"),
      name: "첫째",
      birthdate: iso("2024-01-31"),
      completed: ["hepb-1"],
    },
    { id: childId("c2"), birthdate: iso("2026-04-30"), completed: [] },
  ],
};

async function renderReady() {
  const rendered = await renderHook(() => useChildren(), { wrapper: Wrapper });
  await waitFor(() => expect(rendered.result.current.isReady).toBe(true));
  return rendered;
}

/** 저장된 아이 목록 JSON을 읽어 객체로(없으면 null) */
async function storedChildren(): Promise<unknown> {
  await flushMacrotask();
  const raw = await AsyncStorage.getItem(STORAGE_KEYS.children);
  return raw === null ? null : JSON.parse(raw);
}

describe("FR-16 ChildrenProvider 하이드레이션", () => {
  it("FR-16 저장값 아이 2명이면 그대로 읽고 activeChild는 activeId의 아이이며 쓰지 않는다(setItem 0회)", async () => {
    await seedStorage({ [STORAGE_KEYS.children]: encodeChildren(TWO) });

    const { result } = await renderReady();

    expect(result.current.children).toEqual(TWO.children);
    expect(result.current.activeChild?.id).toBe("c2");
    expect(result.current.canAddChild).toBe(true);
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });

  it("FR-16 읽기 전에는 isReady=false·아이 없음이고, 저장값이 없으면 isReady=true·아이 없음이며 쓰지 않는다", async () => {
    const storage = deferStorage([STORAGE_KEYS.children]);
    const { result } = await renderHook(() => useChildren(), {
      wrapper: Wrapper,
    });

    expect(result.current.isReady).toBe(false);
    expect(result.current.activeChild).toBeNull();

    await storage.resolve(STORAGE_KEYS.children, null);

    expect(result.current.isReady).toBe(true);
    expect(result.current.children).toEqual([]);
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });

  it("AC-21.7 새 키 없이 예전 생년월일 '2026-04-30'·완료 '2026-04-30|hepb-3'이면 아이 1명(이름 없음, hepb-3 완료)으로 읽고 새 키에 쓴 뒤 예전 키 2개를 지운다", async () => {
    await seedStorage({
      [STORAGE_KEYS.birthdate]: "2026-04-30",
      [STORAGE_KEYS.completed]: "2026-04-30|hepb-3",
    });

    const { result } = await renderReady();

    expect(result.current.children).toEqual([
      { id: "c1", birthdate: "2026-04-30", completed: ["hepb-3"] },
    ]);
    expect(await storedChildren()).toEqual({
      v: 1,
      activeId: "c1",
      children: [{ id: "c1", birthdate: "2026-04-30", completed: ["hepb-3"] }],
    });
    expect(await AsyncStorage.getItem(STORAGE_KEYS.birthdate)).toBeNull();
    expect(await AsyncStorage.getItem(STORAGE_KEYS.completed)).toBeNull();
  });

  it.each(["abc", '{"v":1,"activeId":null,"children":[{"id":"x"}]}'])(
    "AC-21.6 손상 저장값 %j → 아이 없음, isReady true, setItem·removeItem 0회, 저장값 그대로(예전 키가 있어도 옮기지 않음)",
    async (raw) => {
      await seedStorage({
        [STORAGE_KEYS.children]: raw,
        [STORAGE_KEYS.birthdate]: "2026-04-30",
      });

      const { result } = await renderReady();

      expect(result.current.children).toEqual([]);
      expect(AsyncStorage.setItem).not.toHaveBeenCalled();
      expect(AsyncStorage.removeItem).not.toHaveBeenCalled();
      expect(await AsyncStorage.getItem(STORAGE_KEYS.children)).toBe(raw);
    }
  );

  it("FR-16 하이드레이션 전에 아이를 더했으면 늦게 도착한 저장값과 예전 키 이전으로 덮어쓰지 않는다", async () => {
    await seedStorage({ [STORAGE_KEYS.birthdate]: "2024-01-31" });
    const storage = deferStorage([STORAGE_KEYS.children]);
    const { result } = await renderHook(() => useChildren(), {
      wrapper: Wrapper,
    });

    await act(async () => {
      result.current.addChild({ birthdate: iso("2026-04-30") });
    });
    await storage.resolve(STORAGE_KEYS.children, null);
    await flushMacrotask();

    expect(result.current.isReady).toBe(true);
    expect(result.current.children.map((child) => child.birthdate)).toEqual([
      "2026-04-30",
    ]);
    expect(await AsyncStorage.getItem(STORAGE_KEYS.birthdate)).toBe(
      "2024-01-31"
    );
  });
});

describe("AC-21.1 [unit] 아이 추가·선택", () => {
  it("AC-21.1 [unit] addChild({ name: '  민준 ', birthdate })는 이름을 다듬어 더하고 그 아이를 선택하며 저장한다. 이름이 공백뿐이면 이름 없이 더한다", async () => {
    const { result } = await renderReady();

    let first: ChildId | null = null;
    await act(async () => {
      first = result.current.addChild({
        name: "  민준 ",
        birthdate: iso("2024-01-31"),
      });
    });
    await act(async () => {
      result.current.addChild({ name: "   ", birthdate: iso("2026-04-30") });
    });

    expect(first).not.toBeNull();
    expect(result.current.children.map((child) => child.name)).toEqual([
      "민준",
      undefined,
    ]);
    expect(result.current.activeChild?.birthdate).toBe("2026-04-30");
    const stored = await storedChildren();
    expect(stored).toMatchObject({
      v: 1,
      children: [
        { name: "민준", birthdate: "2024-01-31", completed: [] },
        { birthdate: "2026-04-30", completed: [] },
      ],
    });
  });

  it("AC-21.4 [unit] 10명이면 canAddChild false이고 addChild는 null을 돌려주며 아무것도 저장하지 않는다", async () => {
    const ten: ChildrenState = {
      activeId: null,
      children: Array.from({ length: MAX_CHILDREN }, (_, index) => ({
        id: childId(`c${index + 10}`),
        birthdate: iso("2026-04-30"),
        completed: [],
      })),
    };
    await seedStorage({ [STORAGE_KEYS.children]: encodeChildren(ten) });
    const { result } = await renderReady();

    expect(result.current.canAddChild).toBe(false);
    let added: ChildId | null = childId("c1");
    await act(async () => {
      added = result.current.addChild({ birthdate: iso("2025-01-01") });
    });

    expect(added).toBeNull();
    expect(result.current.children).toHaveLength(MAX_CHILDREN);
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });

  it("AC-21.3 [unit] selectChild는 일정을 보여 줄 아이를 바꾸고 저장하며, 이미 선택된 아이나 없는 id면 저장하지 않는다", async () => {
    await seedStorage({ [STORAGE_KEYS.children]: encodeChildren(TWO) });
    const { result } = await renderReady();

    await act(async () => {
      result.current.selectChild(childId("c2"));
      result.current.selectChild(childId("c99"));
    });
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();

    await act(async () => {
      result.current.selectChild(childId("c1"));
    });

    expect(result.current.activeChild?.name).toBe("첫째");
    expect(await storedChildren()).toMatchObject({ activeId: "c1" });
  });

  it("AC-21.3 [unit] toggleCompleted는 선택된 아이의 완료 기록만 바꾸고, 아이가 없으면 아무것도 하지 않는다", async () => {
    const empty = await renderReady();
    await act(async () => {
      empty.result.current.toggleCompleted("hepb-3");
    });
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
    await empty.unmount();

    await seedStorage({ [STORAGE_KEYS.children]: encodeChildren(TWO) });
    const { result } = await renderReady();

    await act(async () => {
      result.current.toggleCompleted("hepb-3");
    });

    expect(
      result.current.children.map((child) => [...child.completed])
    ).toEqual([["hepb-1"], ["hepb-3"]]);
  });
});

describe("AC-21.5 [unit] 아이 삭제", () => {
  it("AC-21.5 [unit] removeChild는 그 아이(와 완료 기록)를 지우고 남은 아이 목록을 저장하며, 마지막 아이를 지우면 저장 키 자체를 지운다", async () => {
    await seedStorage({ [STORAGE_KEYS.children]: encodeChildren(TWO) });
    const { result } = await renderReady();

    await act(async () => {
      result.current.removeChild(childId("c1"));
    });

    expect(result.current.children.map((child) => child.id)).toEqual(["c2"]);
    expect(await storedChildren()).toEqual({
      v: 1,
      activeId: "c2",
      children: [{ id: "c2", birthdate: "2026-04-30", completed: [] }],
    });

    await act(async () => {
      result.current.removeChild(childId("c2"));
    });

    expect(result.current.children).toEqual([]);
    expect(result.current.activeChild).toBeNull();
    expect(await AsyncStorage.getItem(STORAGE_KEYS.children)).toBeNull();
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith(STORAGE_KEYS.children);
  });

  it("AC-21.5 [unit] 없는 id를 지우면 아무것도 저장하지 않는다", async () => {
    await seedStorage({ [STORAGE_KEYS.children]: encodeChildren(TWO) });
    const { result } = await renderReady();

    await act(async () => {
      result.current.removeChild(childId("c99"));
    });

    expect(result.current.children).toHaveLength(2);
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
    expect(AsyncStorage.removeItem).not.toHaveBeenCalled();
  });
});

describe("G-5 ChildrenContext 규약", () => {
  it("G-5 Context 값은 상태가 바뀌지 않으면 같은 참조이고 함수는 안정적이다(useMemo·useCallback)", async () => {
    const { result, rerender } = await renderReady();
    const first = result.current;

    await rerender(undefined);

    expect(result.current).toBe(first);
    expect(result.current.addChild).toBe(first.addChild);
    expect(result.current.removeChild).toBe(first.removeChild);
  });

  it("G-5 useChildren을 ChildrenProvider 밖에서 쓰면 throw한다", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});

    await expect(renderHook(() => useChildren())).rejects.toThrow(
      /ChildrenProvider/
    );
  });
});
