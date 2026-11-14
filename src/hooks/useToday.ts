import { createContext, useContext, useEffect, useState } from "react";
import { AppState } from "react-native";

import { startOfDay, toIsoDate } from "@/lib/date";

// 화면의 now 공급(설계서 §5.6·§10.2). 테스트는 Provider로 시계를 주입하고, 프로덕션은 기본값 new Date를 쓴다(테스트 분기 없음).

/** 현재 시각을 돌려주는 시계. 기본값은 실제 시계다 */
export const ClockContext = createContext<() => Date>(() => new Date());

/**
 * 주입 시계의 로컬 자정 Date. 같은 날이면 같은 Date 객체를 유지해 메모 재계산을 막고,
 * 앱이 'active'로 돌아올 때 날짜가 바뀌었으면 갱신한다(AC-5.6. 자정 타이머는 두지 않는다).
 * 화면 useMemo 의존성은 Date identity가 아니라 toIsoDate(today) 문자열로 둔다.
 */
export function useToday(): Date {
  const getNow = useContext(ClockContext);
  const [today, setToday] = useState(() => startOfDay(getNow()));

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      const next = startOfDay(getNow());
      setToday((previous) =>
        toIsoDate(next) === toIsoDate(previous) ? previous : next
      );
    });
    return () => subscription.remove();
  }, [getNow]);

  return today;
}
