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

/** 일정 목록 구역. upcoming = 접종할 항목(soon|upcoming), past = 지난 항목 */
export type ScheduleSection = {
  readonly kind: Exclude<ScheduleFilter, "all">;
  readonly groups: readonly ScheduleGroup[];
};

export type ThemePreference = "system" | "light" | "dark";
export type ColorScheme = "light" | "dark";
