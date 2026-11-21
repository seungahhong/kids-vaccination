import { isIsoDate } from "@/lib/date";
import type { IsoDate, ScheduleItemId } from "@/types";

// 접종 완료 기록 순수 모듈(FR-14, U-19~U-22). React·RN을 import하지 않는다(ESLint 순수 레이어).
// v1.7(FR-16)부터 완료 기록은 아이마다 아이 목록(src/lib/children.ts) 안에 들어간다. 여기에는 일정 항목 id 가드, 토글 계산 도우미,
// 그리고 예전(v1.6까지) 단독 키 vaccination-app-completed를 읽는 decodeCompletion만 남는다(아이 1명으로 옮길 때만 쓴다).
// 예전 저장 형식은 JSON이 아닌 원시 문자열이었다: `${생년월일}|${id},${id}…`  예: "2026-04-30|hepb-3,dtap-1", 없으면 "2026-04-30|"

export type CompletionRecord = {
  readonly birthdate: IsoDate;
  readonly ids: readonly ScheduleItemId[];
};

const FIELD_SEPARATOR = "|";
const ID_SEPARATOR = ",";
/** `${vaccination.id}-${doseNumber}`. 백신 id는 소문자로 시작하는 영숫자, 회차는 양의 정수 */
const SCHEDULE_ITEM_ID = /^[a-z][a-z0-9]*-[1-9][0-9]*$/;

/** 완료가 없을 때 돌려주는 공유 빈 집합(useMemo 의존성이 매번 바뀌지 않게) */
export const NO_COMPLETIONS: ReadonlySet<ScheduleItemId> = new Set();

export function isScheduleItemId(value: string): value is ScheduleItemId {
  return SCHEDULE_ITEM_ID.test(value);
}

/**
 * 예전 저장 문자열 → 기록. 구분자가 없거나 생년월일·id 형식이 하나라도 어긋나면 null이다(손상 값은 "없음", AC-18.4와 같은 규칙).
 * 중복 id는 하나만 남긴다. 데이터에 없는 id(형식은 맞음)는 그대로 두고, 그런 id의 카드가 없을 뿐이다.
 */
export function decodeCompletion(raw: string): CompletionRecord | null {
  const separator = raw.indexOf(FIELD_SEPARATOR);
  if (separator < 0) return null;
  const birthdate = raw.slice(0, separator);
  const list = raw.slice(separator + 1);
  if (!isIsoDate(birthdate)) return null;
  if (list === "") return { birthdate, ids: [] };

  const ids: ScheduleItemId[] = [];
  for (const id of list.split(ID_SEPARATOR)) {
    if (!isScheduleItemId(id)) return null;
    if (!ids.includes(id)) ids.push(id);
  }
  return { birthdate, ids };
}

/** 집합에서 id를 뒤집은 새 집합(입력 불변). 토글 직후 화면을 미리 계산할 때 쓴다(focusTargetAfterToggle) */
export function toggleId(
  ids: ReadonlySet<ScheduleItemId>,
  id: ScheduleItemId
): ReadonlySet<ScheduleItemId> {
  const next = new Set(ids);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}
