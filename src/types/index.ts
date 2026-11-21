// 도메인 타입(타입 전용, 설계서 §4.1). 원본 src/types/index.ts를 이식하고 AI 상담용 메시지 타입을 제거했다(FR-13).
// 원본 Theme은 ThemePreference로 개명했다.

export type Locale = "ko" | "en" | "ja" | "zh";

export type LocalizedText = {
  readonly ko: string;
  readonly en: string;
  readonly ja: string;
  readonly zh: string;
};

export type RecommendedAge = {
  readonly minMonths: number;
  readonly maxMonths?: number;
  readonly label: LocalizedText;
};

/** national = 국가예방접종(필수·무료 지원), optional = 기타예방접종(선택·유료) */
export type VaccinationCategory = "national" | "optional";

export type VaccineDose = {
  readonly doseNumber: number;
  readonly recommendedAge: RecommendedAge;
  /** 이 회차만 분류가 다를 때(예: 수두 2차는 선택). 없으면 백신의 category */
  readonly category?: VaccinationCategory;
};

export type Vaccination = {
  readonly id: string;
  readonly name: LocalizedText;
  readonly disease: LocalizedText;
  readonly category: VaccinationCategory;
  readonly doses: readonly VaccineDose[];
  readonly description: LocalizedText;
  readonly detailedDescription: LocalizedText;
  readonly sideEffects: LocalizedText;
  readonly notes: LocalizedText;
};

export type VaccinationData = {
  /** 데이터를 출처(질병관리청 지침·학회 권고)와 마지막으로 대조한 날. 면책 문구 옆에 표시한다 */
  readonly updatedAt: IsoDate;
  readonly vaccinations: readonly Vaccination[];
};

declare const isoDateBrand: unique symbol;
/** 달력상 유효한 'YYYY-MM-DD'. parseIsoDate/isIsoDate/toIsoDate(src/lib/date.ts)로만 만든다 */
export type IsoDate = string & { readonly [isoDateBrand]: true };

/** 생년월일 허용 범위. 둘 다 로컬 자정 */
export type DateRange = { readonly min: Date; readonly max: Date };

export type ScheduleStatus = "past" | "soon" | "upcoming";
export type ScheduleFilter = "all" | "upcoming" | "past";

/** `${vaccination.id}-${doseNumber}` (예: "hepb-2") */
export type ScheduleItemId = `${string}-${number}`;

export type ScheduleItem = {
  readonly id: ScheduleItemId;
  readonly vaccination: Vaccination;
  readonly dose: VaccineDose;
  /** 로컬 자정 */
  readonly scheduledDate: Date;
  /** 로컬 자정 */
  readonly scheduledEndDate?: Date;
  readonly status: ScheduleStatus;
};

export type ScheduleGroup = {
  readonly minMonths: number;
  readonly items: readonly ScheduleItem[];
};

declare const childIdBrand: unique symbol;
/** 아이 id. isChildId·createChildId(src/lib/children.ts)로만 만든다(FR-16) */
export type ChildId = string & { readonly [childIdBrand]: true };

/** 저장된 아이 한 명(FR-16, U-26). 이름은 선택이고, 없으면 화면에 생년월일을 보인다 */
export type Child = {
  readonly id: ChildId;
  readonly name?: string;
  readonly birthdate: IsoDate;
  /** 접종 완료 체크한 일정 항목(FR-14). 아이마다 따로다 */
  readonly completed: readonly ScheduleItemId[];
};

/** 저장된 아이 목록과 지금 일정을 보여 주는 아이 */
export type ChildrenState = {
  readonly activeId: ChildId | null;
  readonly children: readonly Child[];
};

/**
 * 일정 목록 구역. upcoming = 접종할 항목(soon|upcoming, 완료 체크 전), completed = 완료 체크한 soon|upcoming 항목(U-19),
 * past = 지난 항목(완료 체크와 무관하게 제자리, U-20)
 */
export type ScheduleSectionKind = "upcoming" | "completed" | "past";

export type ScheduleSection = {
  readonly kind: ScheduleSectionKind;
  readonly groups: readonly ScheduleGroup[];
};

/** 사용자가 고른 테마. 라이트·다크 2개다(v1.5 U-24: "시스템"을 없애고 라이트로 합쳤다. OS 색 모드는 따르지 않는다) */
export type ThemePreference = "light" | "dark";
export type ColorScheme = "light" | "dark";
