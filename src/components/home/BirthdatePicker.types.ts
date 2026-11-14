import type { DateRange, IsoDate } from "@/types";

// BirthdatePicker 공통 props(설계서 §5.8). 네이티브(.tsx)와 웹(.web.tsx)이 같은 계약을 구현한다(§7.1).
// 값은 검증된 IsoDate만 오간다. 웹 입력이 비었거나 미완성·무효(키보드 입력 중)면 null을 돌려주고,
// 범위 판정은 Home이 한다(범위 밖 값과 입력 중인 원문도 표시는 유지).
export type BirthdatePickerProps = {
  readonly value: IsoDate | null;
  readonly onChange: (next: IsoDate | null) => void;
  /** 선택 가능 범위(둘 다 로컬 자정). getBirthdateRange(today) */
  readonly range: DateRange;
};
