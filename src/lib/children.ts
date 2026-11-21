import { decodeCompletion, isScheduleItemId } from "@/lib/completion";
import { isIsoDate } from "@/lib/date";
import type {
  Child,
  ChildId,
  ChildrenState,
  IsoDate,
  ScheduleItemId,
} from "@/types";

// 여러 아이 순수 모듈(FR-16, U-26~U-29). React·RN을 import하지 않는다(ESLint 순수 레이어).
// - 아이는 id로 구분한다(같은 생년월일의 쌍둥이도 따로). 이름은 선택이고, 화면 표시는 이름이 있으면 이름, 없으면 생년월일이다(childLabel).
// - 최대 MAX_CHILDREN명이다. 추가한 아이가 지금 일정을 보여 주는 아이(activeId)가 된다.
// - 접종 완료 기록(FR-14)은 아이마다 따로 들고 있다. 아이를 지우면 그 기록도 함께 사라진다.
// 저장 형식(U-29): 키 하나(vaccination-app-children)에 버전이 붙은 JSON이다. 다른 키는 원시 문자열이지만, 이름에 구분자 문자가
// 들어올 수 있어 이 키만 JSON으로 쓴다. 대신 decodeChildren이 모든 필드를 검사하고, 하나라도 어긋나면 null(손상 값 → "없음",
// 덮어쓰지 않음, AC-18.4와 같은 규칙)이다.
//   {"v":1,"activeId":"c1","children":[{"id":"c1","name":"첫째","birthdate":"2024-01-31","completed":["hepb-1"]}]}
// 예전 형식(v1.6까지: 생년월일 키 + 완료 기록 키)은 resolveChildrenHydration이 아이 1명으로 옮긴다.

export const MAX_CHILDREN = 10;
export const MAX_CHILD_NAME_LENGTH = 20;
const STORAGE_VERSION = 1;
const CHILD_ID = /^c[0-9a-z]{1,24}$/;

export const NO_CHILDREN: ChildrenState = { activeId: null, children: [] };

/** 예전 형식에서 옮긴 아이의 id(createChildId(빈 목록, 1)과 같다) */
export const LEGACY_CHILD_ID = "c1";

export function isChildId(value: string): value is ChildId {
  return CHILD_ID.test(value);
}

/** 이름 입력 정리: 앞뒤 공백을 지우고, 비면 undefined(이름 없음), 길면 MAX_CHILD_NAME_LENGTH자로 자른다 */
export function normalizeChildName(raw: string): string | undefined {
  const trimmed = raw.trim();
  if (trimmed === "") return undefined;
  return trimmed.slice(0, MAX_CHILD_NAME_LENGTH);
}

/** 화면에 보이는 아이 이름표: 이름이 있으면 이름, 없으면 생년월일(U-27) */
export function childLabel(child: Pick<Child, "name" | "birthdate">): string {
  return child.name ?? child.birthdate;
}

/** 일정을 보여 줄 아이: activeId의 아이, 없으면 첫 아이, 아이가 없으면 null */
export function activeChildOf(state: ChildrenState): Child | null {
  return (
    state.children.find((child) => child.id === state.activeId) ??
    state.children[0] ??
    null
  );
}

export function canAddChild(state: ChildrenState): boolean {
  return state.children.length < MAX_CHILDREN;
}

/**
 * 새 아이 id. seed(호출자가 주는 수, 보통 현재 시각 ms)를 36진수로 쓰고, 이미 있으면 뒤에 번호를 붙인다.
 * 순수 레이어는 시계를 직접 읽지 않으므로 seed를 받는다
 */
export function createChildId(
  existing: readonly Child[],
  seed: number
): ChildId {
  const base = `c${Math.max(0, Math.floor(seed)).toString(36)}`;
  const taken = new Set<string>(existing.map((child) => child.id));
  let candidate = base;
  for (let suffix = 1; taken.has(candidate); suffix += 1) {
    candidate = `${base}${suffix.toString(36)}`;
  }
  // 유한한 seed면 c + [0-9a-z]+ 형식이다. NaN·Infinity처럼 숫자로 못 쓰는 seed만 여기서 걸린다
  if (!isChildId(candidate)) throw new Error(`잘못된 아이 id: ${candidate}`);
  return candidate;
}

/** 아이를 끝에 더하고 그 아이를 선택한다. 이미 MAX_CHILDREN명이면 그대로 돌려준다 */
export function addChild(state: ChildrenState, child: Child): ChildrenState {
  if (!canAddChild(state)) return state;
  return { activeId: child.id, children: [...state.children, child] };
}

/**
 * 아이를 지운다(그 아이의 완료 기록도 함께). 선택된 아이를 지우면 바로 다음 아이, 마지막이었으면 바로 앞 아이를 선택하고,
 * 아무도 남지 않으면 activeId는 null이다. 없는 id면 그대로 돌려준다
 */
export function removeChild(state: ChildrenState, id: ChildId): ChildrenState {
  const index = state.children.findIndex((child) => child.id === id);
  if (index < 0) return state;
  const children = state.children.filter((child) => child.id !== id);
  if (state.activeId !== id) return { activeId: state.activeId, children };
  const neighbor = children[index] ?? children[index - 1];
  return { activeId: neighbor?.id ?? null, children };
}

/** 일정을 보여 줄 아이를 바꾼다. 없는 id면 그대로 돌려준다 */
export function selectChild(state: ChildrenState, id: ChildId): ChildrenState {
  if (!state.children.some((child) => child.id === id)) return state;
  return { activeId: id, children: state.children };
}

/** 아이 한 명의 일정 항목 완료 체크를 뒤집는다(끝에 더하거나 뺀다). 없는 id면 그대로 돌려준다 */
export function toggleChildCompletion(
  state: ChildrenState,
  id: ChildId,
  itemId: ScheduleItemId
): ChildrenState {
  if (!state.children.some((child) => child.id === id)) return state;
  return {
    activeId: state.activeId,
    children: state.children.map((child) => {
      if (child.id !== id) return child;
      const completed = child.completed.includes(itemId)
        ? child.completed.filter((existing) => existing !== itemId)
        : [...child.completed, itemId];
      return { ...child, completed };
    }),
  };
}

// ---------------------------------------------------------------------------
// 저장 형식(JSON, U-29)
// ---------------------------------------------------------------------------

export function encodeChildren(state: ChildrenState): string {
  return JSON.stringify({
    v: STORAGE_VERSION,
    activeId: state.activeId,
    children: state.children.map((child) => ({
      id: child.id,
      ...(child.name === undefined ? {} : { name: child.name }),
      birthdate: child.birthdate,
      completed: child.completed,
    })),
  });
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** 저장된 아이 하나를 검사한다. 하나라도 어긋나면 null */
function decodeChild(value: unknown): Child | null {
  if (!isRecord(value)) return null;
  const { id, name, birthdate, completed } = value;
  if (typeof id !== "string" || !isChildId(id)) return null;
  if (typeof birthdate !== "string" || !isIsoDate(birthdate)) return null;
  if (name !== undefined) {
    if (typeof name !== "string") return null;
    if (normalizeChildName(name) !== name) return null;
  }
  if (!Array.isArray(completed)) return null;
  const ids: ScheduleItemId[] = [];
  for (const itemId of completed) {
    if (typeof itemId !== "string" || !isScheduleItemId(itemId)) return null;
    if (!ids.includes(itemId)) ids.push(itemId);
  }
  return name === undefined
    ? { id, birthdate, completed: ids }
    : { id, name, birthdate, completed: ids };
}

/**
 * 저장 문자열 → 아이 목록. JSON이 아니거나, 버전이 다르거나, 아이가 MAX_CHILDREN명을 넘거나, id가 겹치거나, 필드 하나라도
 * 형식이 어긋나면 null이다. activeId가 목록에 없으면(또는 null인데 아이가 있으면) 첫 아이로 맞춘다
 */
export function decodeChildren(raw: string): ChildrenState | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(parsed) || parsed.v !== STORAGE_VERSION) return null;
  const { activeId, children: list } = parsed;
  if (!Array.isArray(list) || list.length > MAX_CHILDREN) return null;
  if (activeId !== null && typeof activeId !== "string") return null;

  const children: Child[] = [];
  for (const value of list) {
    const child = decodeChild(value);
    if (child === null) return null;
    if (children.some((existing) => existing.id === child.id)) return null;
    children.push(child);
  }
  const active = children.find((child) => child.id === activeId);
  return { activeId: (active ?? children[0])?.id ?? null, children };
}

/** 하이드레이션 결과. migrated면 예전 키를 새 키로 옮겨 써야 한다(호출자가 저장) */
export type ChildrenHydration = {
  readonly state: ChildrenState;
  readonly migrated: boolean;
};

/**
 * 저장값으로 시작 상태를 정한다(U-29).
 * - 새 키가 있으면 그것을 읽는다. 손상됐으면 아이 없음으로 시작하고 옮기지도 덮어쓰지도 않는다.
 * - 새 키가 없고 예전 생년월일이 유효하면 아이 1명(id LEGACY_CHILD_ID, 이름 없음)으로 옮긴다. 예전 완료 기록이 같은 생년월일의
 *   것이면 그 체크도 옮긴다(다른 생년월일의 기록이나 손상된 기록은 버린다).
 * - 둘 다 없으면 아이 없음이다.
 */
export function resolveChildrenHydration(
  childrenRaw: string | null,
  legacyBirthdateRaw: string | null,
  legacyCompletedRaw: string | null
): ChildrenHydration {
  if (childrenRaw !== null) {
    return {
      state: decodeChildren(childrenRaw) ?? NO_CHILDREN,
      migrated: false,
    };
  }
  if (legacyBirthdateRaw === null || !isIsoDate(legacyBirthdateRaw)) {
    return { state: NO_CHILDREN, migrated: false };
  }
  const birthdate: IsoDate = legacyBirthdateRaw;
  const record =
    legacyCompletedRaw === null ? null : decodeCompletion(legacyCompletedRaw);
  const completed =
    record !== null && record.birthdate === birthdate ? record.ids : [];
  const child: Child = { id: createChildId([], 1), birthdate, completed };
  return { state: { activeId: child.id, children: [child] }, migrated: true };
}
