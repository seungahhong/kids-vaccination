import {
  createContext,
  type ReactElement,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  activeChildOf,
  addChild as addChildTo,
  canAddChild,
  createChildId,
  NO_CHILDREN,
  normalizeChildName,
  removeChild as removeChildFrom,
  selectChild as selectChildIn,
  toggleChildCompletion,
} from "@/lib/children";
import {
  childrenCodec,
  commitChildrenMigration,
  defaultStore,
  type KeyValueStore,
  loadChildren,
  removeValue,
  STORAGE_KEYS,
  writeValue,
} from "@/lib/storage";
import type {
  Child,
  ChildId,
  ChildrenState,
  IsoDate,
  ScheduleItemId,
} from "@/types";

// 여러 아이 상태(FR-16, U-26~U-29). v1.6까지의 BirthdateContext(생년월일 하나)와 CompletionContext(생년월일별 완료 기록)를 대신한다.
// - 저장은 키 하나 vaccination-app-children(검증된 JSON)이다. 웹은 AsyncStorage 웹 구현이 localStorage에, 앱은 기기 앱 저장소
//   (iOS Application Support 파일, Android SQLite)에 쓴다. 화면은 이 Context의 함수만 쓰고 저장소를 직접 만지지 않는다.
// - 하이드레이션: 새 키를 읽고, 없으면 예전 생년월일·완료 키를 아이 1명으로 옮겨 새 키에 쓰고 예전 키를 지운다(loadChildren·
//   commitChildrenMigration). 하이드레이션 전에 사용자가 바꿨으면 늦게 온 읽기 결과로 덮어쓰지 않는다(usePersistentState와 같은 규칙).
// - 바꿀 때마다 메모리 상태를 먼저 바꾸고 비동기로 저장한다. 아이가 0명이 되면 키 자체를 지운다(삭제한 아이가 저장소에 남지 않음, U-28).
// - 최신 상태는 ref로도 들고 있어 연달아 부른 함수가 직전 결과 위에서 계산한다.

export type NewChildInput = {
  /** 이름(선택). 공백만 있으면 이름 없음 */
  readonly name?: string;
  readonly birthdate: IsoDate;
};

export type ChildrenContextValue = {
  readonly children: readonly Child[];
  /** 지금 일정을 보여 주는 아이. 아이가 없으면 null */
  readonly activeChild: Child | null;
  /** MAX_CHILDREN(10)명 미만이면 true */
  readonly canAddChild: boolean;
  /** 아이를 더하고 그 아이를 선택한다. 가득 찼으면 아무것도 하지 않고 null */
  readonly addChild: (input: NewChildInput) => ChildId | null;
  readonly selectChild: (id: ChildId) => void;
  /** 아이와 그 완료 기록을 지운다(저장소에서도) */
  readonly removeChild: (id: ChildId) => void;
  /** 선택된 아이의 일정 항목 완료 체크를 뒤집는다(FR-14) */
  readonly toggleCompleted: (itemId: ScheduleItemId) => void;
  readonly isReady: boolean;
};

const ChildrenContext = createContext<ChildrenContextValue | null>(null);

export function ChildrenProvider(props: {
  children: ReactNode;
  /** 테스트용 저장소(기본 AsyncStorage). 모듈 상수여야 한다 */
  store?: KeyValueStore;
}): ReactElement {
  const store = props.store ?? defaultStore;
  const [state, setState] = useState<ChildrenState>(NO_CHILDREN);
  const [isReady, setIsReady] = useState(false);
  const stateRef = useRef<ChildrenState>(NO_CHILDREN);
  const touchedRef = useRef(false);

  useEffect(() => {
    let active = true;
    void loadChildren(store).then(({ state: loaded, migrated }) => {
      if (!active) return;
      if (!touchedRef.current) {
        stateRef.current = loaded;
        setState(loaded);
        if (migrated) void commitChildrenMigration(loaded, store);
      }
      setIsReady(true);
    });
    return () => {
      active = false;
    };
  }, [store]);

  /** 새 상태를 반영하고 저장한다. 아이가 없으면 키를 지운다 */
  const commit = useCallback(
    (next: ChildrenState) => {
      touchedRef.current = true;
      stateRef.current = next;
      setState(next);
      if (next.children.length === 0) {
        void removeValue(STORAGE_KEYS.children, store);
      } else {
        void writeValue(STORAGE_KEYS.children, childrenCodec, next, store);
      }
    },
    [store]
  );

  const addChild = useCallback(
    (input: NewChildInput): ChildId | null => {
      const current = stateRef.current;
      if (!canAddChild(current)) return null;
      const name = normalizeChildName(input.name ?? "");
      const id = createChildId(current.children, Date.now());
      const child: Child =
        name === undefined
          ? { id, birthdate: input.birthdate, completed: [] }
          : { id, name, birthdate: input.birthdate, completed: [] };
      commit(addChildTo(current, child));
      return id;
    },
    [commit]
  );

  const selectChild = useCallback(
    (id: ChildId) => {
      const current = stateRef.current;
      if (current.activeId === id) return;
      const next = selectChildIn(current, id);
      if (next !== current) commit(next);
    },
    [commit]
  );

  const removeChild = useCallback(
    (id: ChildId) => {
      const current = stateRef.current;
      const next = removeChildFrom(current, id);
      if (next !== current) commit(next);
    },
    [commit]
  );

  const toggleCompleted = useCallback(
    (itemId: ScheduleItemId) => {
      const current = stateRef.current;
      const child = activeChildOf(current);
      if (child === null) return;
      commit(toggleChildCompletion(current, child.id, itemId));
    },
    [commit]
  );

  const activeChild = activeChildOf(state);
  const contextValue = useMemo<ChildrenContextValue>(
    () => ({
      children: state.children,
      activeChild,
      canAddChild: canAddChild(state),
      addChild,
      selectChild,
      removeChild,
      toggleCompleted,
      isReady,
    }),
    [
      state,
      activeChild,
      addChild,
      selectChild,
      removeChild,
      toggleCompleted,
      isReady,
    ]
  );

  return (
    <ChildrenContext.Provider value={contextValue}>
      {props.children}
    </ChildrenContext.Provider>
  );
}

export function useChildren(): ChildrenContextValue {
  const context = useContext(ChildrenContext);
  if (context === null) {
    throw new Error("useChildren은 ChildrenProvider 안에서만 쓸 수 있습니다");
  }
  return context;
}
