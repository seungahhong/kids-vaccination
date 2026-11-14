import rawData from "@/data/vaccinations.json";
import { LOCALES } from "@/lib/locale";
import type {
  Vaccination,
  VaccinationCategory,
  VaccinationData,
} from "@/types";

// 접종 데이터 검증(설계서 §4.2). 개수(14종 41회차)는 데이터 사실이므로 테스트(AC-4.5)가 단언한다.

export type DataValidation =
  | { readonly ok: true; readonly data: VaccinationData }
  | { readonly ok: false; readonly errors: readonly string[] };

const VACCINATION_TEXT_FIELDS = [
  "name",
  "disease",
  "description",
  "detailedDescription",
  "sideEffects",
  "notes",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

const VACCINATION_CATEGORIES: readonly VaccinationCategory[] = [
  "national",
  "optional",
];

function isVaccinationCategory(value: unknown): value is VaccinationCategory {
  return VACCINATION_CATEGORIES.some((category) => category === value);
}

function isInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

function validateLocalizedText(
  value: unknown,
  path: string,
  errors: string[]
): void {
  if (!isRecord(value)) {
    errors.push(`${path}: LocalizedText 객체여야 한다`);
    return;
  }
  for (const key of LOCALES) {
    if (!isNonEmptyString(value[key])) {
      errors.push(`${path}.${key}: 비어 있지 않은 문자열이어야 한다`);
    }
  }
}

function validateRecommendedAge(
  value: unknown,
  path: string,
  errors: string[]
): void {
  if (!isRecord(value)) {
    errors.push(`${path}: 객체여야 한다`);
    return;
  }
  const min = value.minMonths;
  const max = value.maxMonths;
  if (!isInteger(min) || min < 0) {
    errors.push(`${path}.minMonths: 0 이상 정수여야 한다`);
  }
  if (max !== undefined && !isInteger(max)) {
    errors.push(`${path}.maxMonths: 정수여야 한다`);
  }
  if (isInteger(min) && isInteger(max) && max < min) {
    errors.push(`${path}.maxMonths: minMonths 이상이어야 한다`);
  }
  validateLocalizedText(value.label, `${path}.label`, errors);
}

/**
 * 회차 번호는 백신 안에서 유일해야 한다. 일정 항목 id·React key·testID가 `${백신 id}-${doseNumber}`라
 * 번호가 겹치면 카드 두 장이 같은 id를 갖는다(R1-17). seenDoseNumbers는 백신마다 새로 만든다.
 */
function validateDose(
  value: unknown,
  path: string,
  seenDoseNumbers: Set<number>,
  errors: string[]
): void {
  if (!isRecord(value)) {
    errors.push(`${path}: 객체여야 한다`);
    return;
  }
  const doseNumber = value.doseNumber;
  if (!isInteger(doseNumber) || doseNumber < 1) {
    errors.push(`${path}.doseNumber: 양의 정수여야 한다`);
  } else if (seenDoseNumbers.has(doseNumber)) {
    errors.push(`${path}.doseNumber: 중복 회차 번호 ${doseNumber}`);
  } else {
    seenDoseNumbers.add(doseNumber);
  }
  validateRecommendedAge(
    value.recommendedAge,
    `${path}.recommendedAge`,
    errors
  );
  if (value.category !== undefined && !isVaccinationCategory(value.category)) {
    errors.push(
      `${path}.category: 있으면 "national" 또는 "optional"이어야 한다`
    );
  }
}

function validateVaccination(
  value: unknown,
  path: string,
  seenIds: Set<string>,
  errors: string[]
): void {
  if (!isRecord(value)) {
    errors.push(`${path}: 객체여야 한다`);
    return;
  }
  if (!isNonEmptyString(value.id)) {
    errors.push(`${path}.id: 비어 있지 않은 문자열이어야 한다`);
  } else if (seenIds.has(value.id)) {
    errors.push(`${path}.id: 중복 id '${value.id}'`);
  } else {
    seenIds.add(value.id);
  }
  for (const field of VACCINATION_TEXT_FIELDS) {
    validateLocalizedText(value[field], `${path}.${field}`, errors);
  }
  if (!isVaccinationCategory(value.category)) {
    errors.push(`${path}.category: "national" 또는 "optional"이어야 한다`);
  }
  const doses = value.doses;
  if (!Array.isArray(doses) || doses.length === 0) {
    errors.push(`${path}.doses: 1개 이상의 배열이어야 한다`);
    return;
  }
  const seenDoseNumbers = new Set<number>();
  doses.forEach((dose: unknown, index) =>
    validateDose(dose, `${path}.doses[${index}]`, seenDoseNumbers, errors)
  );
}

export function validateVaccinationData(value: unknown): DataValidation {
  if (!isRecord(value)) {
    return { ok: false, errors: ["최상위 값은 객체여야 한다"] };
  }
  const list = value.vaccinations;
  if (!Array.isArray(list)) {
    return { ok: false, errors: ["vaccinations는 배열이어야 한다"] };
  }
  const errors: string[] = [];
  const seenIds = new Set<string>();
  list.forEach((item: unknown, index) =>
    validateVaccination(item, `vaccinations[${index}]`, seenIds, errors)
  );
  if (errors.length > 0) return { ok: false, errors };
  // 위 구조 검사가 VaccinationData의 모든 필드(타입·비어 있지 않음·범위)를 확인했으므로 좁힌다
  return { ok: true, data: value as VaccinationData };
}

export function isVaccinationData(value: unknown): value is VaccinationData {
  return validateVaccinationData(value).ok;
}

/** 검증을 통과한 백신 목록. 실패하면 throw(개발 중 즉시 발견, 설계서 §6.1) */
export function loadVaccinations(value: unknown): readonly Vaccination[] {
  const result = validateVaccinationData(value);
  if (!result.ok) {
    throw new Error(`vaccinations.json 검증 실패: ${result.errors.join("; ")}`);
  }
  return result.data.vaccinations;
}

/** 모듈 로드 시 1회 검증한 접종 데이터(14종 41회차) */
export const VACCINATIONS: readonly Vaccination[] = loadVaccinations(rawData);
