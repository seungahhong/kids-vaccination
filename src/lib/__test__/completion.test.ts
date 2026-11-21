import {
  decodeCompletion,
  isScheduleItemId,
  NO_COMPLETIONS,
  toggleId,
} from "@/lib/completion";
import type { ScheduleItemId } from "@/types";

// 접종 완료 기록 도우미(FR-14). v1.7(FR-16)부터 완료 기록은 아이마다 아이 목록 안에 들어가고(src/lib/__test__/children.test.ts),
// 여기서는 일정 항목 id 가드, 토글 계산, 예전(v1.6까지) 단독 키 형식 `${생년월일}|${id},…`를 읽는 decodeCompletion을 본다.
// decodeCompletion은 예전 데이터를 아이 1명으로 옮길 때만 쓰고(AC-21.7), 손상 값은 null이라 체크 없이 옮긴다.

/** 유효한 일정 항목 id(테스트 입력) */
function itemId(value: string): ScheduleItemId {
  if (!isScheduleItemId(value)) throw new Error(`id 형식이 아니다: ${value}`);
  return value;
}

const HEPB_3 = itemId("hepb-3");
const DTAP_3 = itemId("dtap-3");

describe("AC-21.7 예전 완료 기록 decode — 손상 값은 null", () => {
  it.each([
    "",
    "abc",
    "2026-04-30",
    "2026-02-30|hepb-3",
    "2026-4-30|hepb-3",
    "2026-04-30|hepb",
    "2026-04-30|hepb-0",
    "2026-04-30|HEPB-3",
    "2026-04-30|hepb-3,",
    "2026-04-30|hepb-3,,dtap-3",
    "2026-04-30|hepb-3|dtap-3",
    "2026-04-30|1hepb-3",
  ])("AC-21.7 decodeCompletion(%j)는 null이다", (raw) => {
    expect(decodeCompletion(raw)).toBeNull();
  });

  it("AC-21.7 유효한 값은 생년월일과 id 목록(순서 유지, 중복 제거)으로 읽고, 완료가 없으면 빈 목록이다", () => {
    expect(decodeCompletion("2026-04-30|hepb-3,dtap-3,hepb-3")).toEqual({
      birthdate: "2026-04-30",
      ids: ["hepb-3", "dtap-3"],
    });
    expect(decodeCompletion("2026-04-30|")).toEqual({
      birthdate: "2026-04-30",
      ids: [],
    });
    // 형식만 맞으면 데이터에 없는 id도 그대로 둔다(그 id의 카드가 없을 뿐이다)
    expect(decodeCompletion("2026-04-30|nirsevimab-12")).toEqual({
      birthdate: "2026-04-30",
      ids: ["nirsevimab-12"],
    });
  });
});

describe("FR-14 완료 기록 도우미", () => {
  it("FR-14 isScheduleItemId는 소문자로 시작하는 영숫자 백신 id + '-' + 양의 정수 회차만 받는다", () => {
    expect(
      ["hepb-3", "nirsevimab-1", "hpv-12", "a1-2"].map(isScheduleItemId)
    ).toEqual([true, true, true, true]);
    expect(
      ["hepb", "hepb-0", "hepb-03", "-3", "Hepb-3", "hep b-3", "hepb-3a"].map(
        isScheduleItemId
      )
    ).toEqual([false, false, false, false, false, false, false]);
  });

  it("U-22 toggleId는 id를 더하거나 뺀 새 집합을 돌려주고 입력 집합은 바꾸지 않는다. NO_COMPLETIONS는 빈 집합이다", () => {
    const ids: ReadonlySet<ScheduleItemId> = new Set([HEPB_3]);

    expect([...toggleId(ids, DTAP_3)]).toEqual([HEPB_3, DTAP_3]);
    expect([...toggleId(ids, HEPB_3)]).toEqual([]);
    expect([...ids]).toEqual([HEPB_3]);
    expect(NO_COMPLETIONS.size).toBe(0);
  });
});
