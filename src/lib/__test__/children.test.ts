import {
  activeChildOf,
  addChild,
  canAddChild,
  childLabel,
  createChildId,
  decodeChildren,
  encodeChildren,
  isChildId,
  LEGACY_CHILD_ID,
  MAX_CHILD_NAME_LENGTH,
  MAX_CHILDREN,
  NO_CHILDREN,
  normalizeChildName,
  removeChild,
  resolveChildrenHydration,
  selectChild,
  toggleChildCompletion,
} from "@/lib/children";
import { toIsoDate } from "@/lib/date";
import type { Child, ChildId, ChildrenState, ScheduleItemId } from "@/types";

import { day } from "../../../test-utils/render";

// 여러 아이 순수 모듈(FR-16, U-26~U-29). 화면·저장 경로는 ChildrenContext·화면 테스트와 E2E(AC-21.x)가 본다.

/** 유효한 아이 id(테스트 입력) */
function childId(value: string): ChildId {
  if (!isChildId(value)) throw new Error(`아이 id 형식이 아니다: ${value}`);
  return value;
}

function child(
  id: string,
  birthdate: string,
  extra: { name?: string; completed?: ScheduleItemId[] } = {}
): Child {
  const base = {
    id: childId(id),
    birthdate: toIsoDate(day(birthdate)),
    completed: extra.completed ?? [],
  };
  return extra.name === undefined ? base : { ...base, name: extra.name };
}

const FIRST = child("c1", "2024-01-31", {
  name: "첫째",
  completed: ["hepb-1"],
});
const SECOND = child("c2", "2026-04-30");
const THIRD = child("c3", "2025-06-15", { name: "셋째" });
const THREE: ChildrenState = {
  activeId: SECOND.id,
  children: [FIRST, SECOND, THIRD],
};

describe("U-27 아이 이름표와 이름 정리", () => {
  it("U-27 childLabel은 이름이 있으면 이름, 없으면 생년월일이다", () => {
    expect(childLabel(FIRST)).toBe("첫째");
    expect(childLabel(SECOND)).toBe("2026-04-30");
  });

  it("U-26 normalizeChildName은 앞뒤 공백을 지우고, 비면 undefined, MAX_CHILD_NAME_LENGTH(20)자를 넘으면 자른다", () => {
    expect(normalizeChildName("  민준  ")).toBe("민준");
    expect(normalizeChildName("   ")).toBeUndefined();
    expect(normalizeChildName("")).toBeUndefined();
    expect(MAX_CHILD_NAME_LENGTH).toBe(20);
    expect(normalizeChildName("가".repeat(25))).toBe("가".repeat(20));
  });
});

describe("U-26 아이 목록 조작", () => {
  it("U-26 MAX_CHILDREN은 10이고, 10명 미만이면 canAddChild true·10명이면 false이며 가득 찬 목록에 addChild는 그대로 돌려준다", () => {
    expect(MAX_CHILDREN).toBe(10);
    const ten: ChildrenState = {
      activeId: null,
      children: Array.from({ length: 10 }, (_, index) =>
        child(`c${index + 10}`, "2026-04-30")
      ),
    };

    expect(canAddChild(NO_CHILDREN)).toBe(true);
    expect(canAddChild(THREE)).toBe(true);
    expect(canAddChild(ten)).toBe(false);
    expect(addChild(ten, child("cz", "2026-01-01"))).toBe(ten);
  });

  it("U-26 addChild는 끝에 더하고 그 아이를 선택하며 입력을 바꾸지 않는다(같은 생년월일의 쌍둥이도 따로 더한다)", () => {
    const twin = child("c9", "2026-04-30", { name: "쌍둥이" });

    const next = addChild(THREE, twin);

    expect(next.activeId).toBe(twin.id);
    expect(next.children.map((each) => each.id)).toEqual([
      "c1",
      "c2",
      "c3",
      "c9",
    ]);
    expect(THREE.children).toHaveLength(3);
  });

  it("U-28 removeChild: 선택 안 된 아이를 지우면 선택은 그대로, 선택된 아이를 지우면 다음 아이(마지막이면 앞 아이), 모두 지우면 null이다. 없는 id는 그대로다", () => {
    expect(removeChild(THREE, FIRST.id)).toEqual({
      activeId: SECOND.id,
      children: [SECOND, THIRD],
    });
    expect(removeChild(THREE, SECOND.id).activeId).toBe(THIRD.id);
    expect(
      removeChild({ ...THREE, activeId: THIRD.id }, THIRD.id).activeId
    ).toBe(SECOND.id);
    expect(
      removeChild({ activeId: FIRST.id, children: [FIRST] }, FIRST.id)
    ).toEqual(NO_CHILDREN);
    expect(removeChild(THREE, childId("c99"))).toBe(THREE);
  });

  it("U-26 selectChild는 있는 아이만 고르고, activeChildOf는 activeId의 아이(없으면 첫 아이, 아이가 없으면 null)다", () => {
    expect(selectChild(THREE, FIRST.id).activeId).toBe(FIRST.id);
    expect(selectChild(THREE, childId("c99"))).toBe(THREE);
    expect(activeChildOf(THREE)).toBe(SECOND);
    expect(activeChildOf({ ...THREE, activeId: null })).toBe(FIRST);
    expect(activeChildOf(NO_CHILDREN)).toBeNull();
  });

  it("FR-16 toggleChildCompletion은 그 아이의 완료 체크만 뒤집고(다른 아이 기록은 그대로), 없는 id는 그대로 돌려준다", () => {
    const checked = toggleChildCompletion(THREE, SECOND.id, "hepb-3");
    expect(checked.children[1]?.completed).toEqual(["hepb-3"]);
    expect(checked.children[0]).toBe(FIRST);

    const unchecked = toggleChildCompletion(checked, SECOND.id, "hepb-3");
    expect(unchecked.children[1]?.completed).toEqual([]);
    expect(toggleChildCompletion(THREE, childId("c99"), "hepb-3")).toBe(THREE);
  });

  it("U-26 createChildId는 seed의 36진수에 c를 붙이고, 이미 있으면 번호를 붙이며, 숫자로 쓸 수 없는 seed면 throw한다", () => {
    expect(createChildId([], 1)).toBe("c1");
    expect(createChildId([], 1_794_637_799_677)).toBe(
      `c${(1_794_637_799_677).toString(36)}`
    );
    expect(createChildId([FIRST], 1)).toBe("c11");
    expect(createChildId([FIRST, child("c11", "2026-01-01")], 1)).toBe("c12");
    expect(() => createChildId([], Number.NaN)).toThrow(/아이 id/);
  });

  it("U-26 isChildId는 c + 소문자·숫자만 받는다", () => {
    expect(["c1", "cmhz0abc", "c0"].map(isChildId)).toEqual([true, true, true]);
    expect(["1", "C1", "c", "c-1", "cNaN", ""].map(isChildId)).toEqual([
      false,
      false,
      false,
      false,
      false,
      false,
    ]);
  });
});

describe("U-29 저장 형식(JSON)", () => {
  it("U-29 encodeChildren은 버전 1 JSON이고(이름 없는 아이는 name 키 없음) decodeChildren과 왕복한다", () => {
    const raw = encodeChildren(THREE);

    expect(JSON.parse(raw)).toEqual({
      v: 1,
      activeId: "c2",
      children: [
        {
          id: "c1",
          name: "첫째",
          birthdate: "2024-01-31",
          completed: ["hepb-1"],
        },
        { id: "c2", birthdate: "2026-04-30", completed: [] },
        { id: "c3", name: "셋째", birthdate: "2025-06-15", completed: [] },
      ],
    });
    expect(decodeChildren(raw)).toEqual(THREE);
    expect(decodeChildren(encodeChildren(NO_CHILDREN))).toEqual(NO_CHILDREN);
  });

  it("U-29 activeId가 목록에 없거나 null이면 첫 아이로 맞추고, 완료 기록의 중복 id는 하나만 남긴다", () => {
    const stored = (activeId: string | null) =>
      JSON.stringify({
        v: 1,
        activeId,
        children: [
          {
            id: "c1",
            birthdate: "2024-01-31",
            completed: ["hepb-1", "hepb-1"],
          },
        ],
      });

    expect(decodeChildren(stored("c9"))?.activeId).toBe("c1");
    expect(decodeChildren(stored(null))?.activeId).toBe("c1");
    expect(decodeChildren(stored("c1"))?.children[0]?.completed).toEqual([
      "hepb-1",
    ]);
  });

  const valid = { id: "c1", birthdate: "2024-01-31", completed: [] };
  it.each([
    ["JSON 아님", "abc"],
    ["빈 문자열", ""],
    ["배열", "[]"],
    ["버전 다름", JSON.stringify({ v: 2, activeId: null, children: [] })],
    ["children 없음", JSON.stringify({ v: 1, activeId: null })],
    ["activeId 숫자", JSON.stringify({ v: 1, activeId: 1, children: [] })],
    [
      "11명",
      JSON.stringify({
        v: 1,
        activeId: null,
        children: Array.from({ length: 11 }, (_, index) => ({
          ...valid,
          id: `c${index + 10}`,
        })),
      }),
    ],
    [
      "id 중복",
      JSON.stringify({ v: 1, activeId: null, children: [valid, valid] }),
    ],
    [
      "아이가 객체 아님",
      JSON.stringify({ v: 1, activeId: null, children: [1] }),
    ],
    [
      "id 형식",
      JSON.stringify({
        v: 1,
        activeId: null,
        children: [{ ...valid, id: "x1" }],
      }),
    ],
    [
      "생년월일 무효",
      JSON.stringify({
        v: 1,
        activeId: null,
        children: [{ ...valid, birthdate: "2024-02-30" }],
      }),
    ],
    [
      "이름이 문자열 아님",
      JSON.stringify({
        v: 1,
        activeId: null,
        children: [{ ...valid, name: 3 }],
      }),
    ],
    [
      "이름 앞뒤 공백",
      JSON.stringify({
        v: 1,
        activeId: null,
        children: [{ ...valid, name: " 민준" }],
      }),
    ],
    [
      "이름 21자",
      JSON.stringify({
        v: 1,
        activeId: null,
        children: [{ ...valid, name: "가".repeat(21) }],
      }),
    ],
    [
      "completed 배열 아님",
      JSON.stringify({
        v: 1,
        activeId: null,
        children: [{ ...valid, completed: "hepb-1" }],
      }),
    ],
    [
      "completed id 형식",
      JSON.stringify({
        v: 1,
        activeId: null,
        children: [{ ...valid, completed: ["HEPB-1"] }],
      }),
    ],
  ])("AC-21.6 손상 값(%s)은 decodeChildren이 null이다", (_case, raw) => {
    expect(decodeChildren(raw)).toBeNull();
  });
});

describe("AC-21.7 예전 저장값 이전", () => {
  it("AC-21.7 새 키가 없고 예전 생년월일 '2026-04-30'·같은 생년월일의 완료 기록이 있으면 아이 1명(id c1, 이름 없음, 완료 체크 포함)으로 옮기고 migrated다", () => {
    expect(
      resolveChildrenHydration(null, "2026-04-30", "2026-04-30|hepb-3,dtap-3")
    ).toEqual({
      state: {
        activeId: LEGACY_CHILD_ID,
        children: [
          {
            id: LEGACY_CHILD_ID,
            birthdate: "2026-04-30",
            completed: ["hepb-3", "dtap-3"],
          },
        ],
      },
      migrated: true,
    });
  });

  it("AC-21.7 예전 완료 기록이 다른 생년월일의 것이거나 손상·없음이면 체크 없이 옮긴다", () => {
    for (const completed of ["2024-01-31|hepb-1", "abc", null]) {
      expect(
        resolveChildrenHydration(null, "2026-04-30", completed).state
          .children[0]?.completed
      ).toEqual([]);
    }
  });

  it("AC-21.7 새 키가 있으면 예전 키를 보지 않고(손상이면 아이 없음, 옮기지 않음), 둘 다 없거나 예전 생년월일이 손상이면 아이 없음이다", () => {
    expect(
      resolveChildrenHydration(encodeChildren(THREE), "2026-04-30", null)
    ).toEqual({ state: THREE, migrated: false });
    expect(resolveChildrenHydration("abc", "2026-04-30", null)).toEqual({
      state: NO_CHILDREN,
      migrated: false,
    });
    expect(resolveChildrenHydration(null, null, null)).toEqual({
      state: NO_CHILDREN,
      migrated: false,
    });
    expect(resolveChildrenHydration(null, "abc", "abc|hepb-1")).toEqual({
      state: NO_CHILDREN,
      migrated: false,
    });
  });
});
