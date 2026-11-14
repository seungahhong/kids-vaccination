import rawData from "@/data/vaccinations.json";
import {
  isVaccinationData,
  loadVaccinations,
  VACCINATIONS,
  validateVaccinationData,
} from "@/lib/vaccinationData";
import type { LocalizedText } from "@/types";

const LOCALE_KEYS = ["ko", "en", "ja", "zh"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 실제 vaccinations.json의 깊은 복사본(Record 뷰). 한 곳만 손상시켜 음성 사본을 만든다(설계서 §4.2) */
function cloneData(): Record<string, unknown> {
  return JSON.parse(JSON.stringify(rawData));
}

function vaccinationAt(
  root: Record<string, unknown>,
  index: number
): Record<string, unknown> {
  const list = root.vaccinations;
  if (!Array.isArray(list)) throw new Error("vaccinations가 배열이 아니다");
  const item: unknown = list[index];
  if (!isRecord(item)) throw new Error(`vaccinations[${index}]가 없다`);
  return item;
}

function recordField(
  obj: Record<string, unknown>,
  key: string
): Record<string, unknown> {
  const value = obj[key];
  if (!isRecord(value)) throw new Error(`${key}가 객체가 아니다`);
  return value;
}

function doseAt(
  root: Record<string, unknown>,
  vaccinationIndex: number,
  doseIndex: number
): Record<string, unknown> {
  const doses = vaccinationAt(root, vaccinationIndex).doses;
  if (!Array.isArray(doses)) throw new Error("doses가 배열이 아니다");
  const dose: unknown = doses[doseIndex];
  if (!isRecord(dose)) throw new Error(`doses[${doseIndex}]가 없다`);
  return dose;
}

function corrupted(
  mutate: (root: Record<string, unknown>) => void
): Record<string, unknown> {
  const root = cloneData();
  mutate(root);
  return root;
}

function expectInvalid(value: unknown): void {
  const result = validateVaccinationData(value);

  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
    for (const error of result.errors)
      expect(error).toEqual(expect.any(String));
  }
  expect(isVaccinationData(value)).toBe(false);
}

function expectLocalizedText(text: LocalizedText): void {
  for (const key of LOCALE_KEYS) {
    expect(typeof text[key]).toBe("string");
    expect(text[key].length).toBeGreaterThan(0);
  }
}

// AC-4.5 (FR-03): 실제 데이터가 VaccinationData 검증을 통과하고 사실(14종/41회차/중복 0)이 맞다(v1.3 U-15: 국가 13종 + 선택 1종).
describe("AC-4.5 vaccinations.json 검증", () => {
  it("AC-4.5 validateVaccinationData·isVaccinationData가 실제 데이터에 true이고 백신 14개, 회차 합 41, id 중복 0이다", () => {
    const result = validateVaccinationData(rawData);

    expect(result.ok).toBe(true);
    expect(isVaccinationData(rawData)).toBe(true);
    if (!result.ok) throw new Error(result.errors.join("; "));

    const ids = result.data.vaccinations.map((v) => v.id);
    expect(result.data.vaccinations).toHaveLength(14);
    expect(
      result.data.vaccinations.reduce((sum, v) => sum + v.doses.length, 0)
    ).toBe(41);
    expect(new Set(ids).size).toBe(ids.length);
    expect(VACCINATIONS).toEqual(result.data.vaccinations);
  });

  it("AC-4.5 모든 LocalizedText는 ko/en/ja/zh 4개의 비어 있지 않은 문자열이고 maxMonths가 있으면 maxMonths ≥ minMonths다", () => {
    let textCount = 0;
    let rangeCount = 0;
    for (const v of VACCINATIONS) {
      for (const text of [
        v.name,
        v.disease,
        v.description,
        v.detailedDescription,
        v.sideEffects,
        v.notes,
      ]) {
        expectLocalizedText(text);
        textCount += 1;
      }
      for (const dose of v.doses) {
        expectLocalizedText(dose.recommendedAge.label);
        textCount += 1;
        expect(Number.isInteger(dose.doseNumber)).toBe(true);
        expect(dose.doseNumber).toBeGreaterThanOrEqual(1);
        if (dose.recommendedAge.maxMonths !== undefined) {
          expect(dose.recommendedAge.maxMonths).toBeGreaterThanOrEqual(
            dose.recommendedAge.minMonths
          );
          rangeCount += 1;
        }
      }
    }
    expect(textCount).toBe(14 * 6 + 41);
    expect(rangeCount).toBeGreaterThan(0);
  });

  it("AC-4.5 name.zh를 삭제한 사본은 false를 반환한다", () => {
    const copy = corrupted((root) => {
      delete recordField(vaccinationAt(root, 0), "name").zh;
    });

    expect(isVaccinationData(copy)).toBe(false);
    expectInvalid(copy);
  });
});

// U-15: 분류(필수 = 국가예방접종, 선택 = 학회 권장 비지원 접종). 근거는 PRD 부록 E.8(질병관리청 2026 지침·KPS 권고).
describe("U-15 vaccinations.json 분류", () => {
  /** 회차별 실효 분류(회차 category가 있으면 그것, 없으면 백신 category) */
  function effectiveCategories() {
    return VACCINATIONS.flatMap((v) =>
      v.doses.map((dose) => ({
        id: `${v.id}-${dose.doseNumber}`,
        category: dose.category ?? v.category,
      }))
    );
  }

  it("U-15 선택 회차는 수두 2차(var-2)와 RSV 항체주사(nirsevimab-1) 2개이고 나머지 39회차는 필수다", () => {
    const categories = effectiveCategories();

    expect(
      categories
        .filter((dose) => dose.category === "optional")
        .map((dose) => dose.id)
    ).toEqual(["var-2", "nirsevimab-1"]);
    expect(
      categories.filter((dose) => dose.category === "national")
    ).toHaveLength(39);
  });

  it("U-15 백신 단위로는 nirsevimab만 optional이고, var는 national이며 2차만 회차 category optional이다", () => {
    expect(
      VACCINATIONS.filter((v) => v.category === "optional").map((v) => v.id)
    ).toEqual(["nirsevimab"]);
    const varicella = VACCINATIONS.find((v) => v.id === "var");
    expect(varicella?.category).toBe("national");
    expect(varicella?.doses.map((dose) => dose.category)).toEqual([
      undefined,
      "optional",
    ]);
  });
});

// 지원(G-5, 설계서 §4.2 표 · 비평 C-13): 검증 규칙별 음성 사본 13종. src/lib branches 95% 확보용.
describe("G-5 vaccinationData 음성 사본", () => {
  it("G-5 vaccinationData 음성 #1 최상위 값이 null·배열이면 ok: false", () => {
    expectInvalid(null);
    expectInvalid([]);
    expectInvalid("vaccinations");
  });

  it("G-5 vaccinationData 음성 #2 vaccinations가 배열이 아니면 ok: false", () => {
    expectInvalid(
      corrupted((root) => {
        root.vaccinations = "bcg";
      })
    );
    expectInvalid({});
  });

  it("G-5 vaccinationData 음성 #3 백신 id가 빈 문자열이면 ok: false", () => {
    expectInvalid(
      corrupted((root) => {
        vaccinationAt(root, 0).id = "";
      })
    );
    expectInvalid(
      corrupted((root) => {
        vaccinationAt(root, 0).id = 7;
      })
    );
    expectInvalid(
      corrupted((root) => {
        const list = root.vaccinations;
        if (Array.isArray(list)) list[0] = "bcg";
      })
    );
  });

  it("G-5 vaccinationData 음성 #4 백신 id가 중복이면 ok: false", () => {
    expectInvalid(
      corrupted((root) => {
        vaccinationAt(root, 1).id = "bcg";
      })
    );
  });

  it("G-5 vaccinationData 음성 #5 name.zh 삭제(AC-4.5 대표 사례)면 ok: false", () => {
    expectInvalid(
      corrupted((root) => {
        delete recordField(vaccinationAt(root, 0), "name").zh;
      })
    );
  });

  it("G-5 vaccinationData 음성 #6 LocalizedText 값이 빈 문자열이면 ok: false", () => {
    expectInvalid(
      corrupted((root) => {
        recordField(vaccinationAt(root, 3), "disease").en = "";
      })
    );
    expectInvalid(
      corrupted((root) => {
        recordField(doseAt(root, 0, 0), "recommendedAge").label = {
          ko: "",
          en: "At birth",
          ja: "出生時",
          zh: "出生时",
        };
      })
    );
  });

  it("G-5 vaccinationData 음성 #7 LocalizedText 값이 문자열이 아니면(숫자) ok: false", () => {
    expectInvalid(
      corrupted((root) => {
        recordField(vaccinationAt(root, 5), "description").ja = 123;
      })
    );
    expectInvalid(
      corrupted((root) => {
        vaccinationAt(root, 5).notes = "문자열 전체";
      })
    );
  });

  it("G-5 vaccinationData 음성 #8 doses가 빈 배열이면 ok: false", () => {
    expectInvalid(
      corrupted((root) => {
        vaccinationAt(root, 0).doses = [];
      })
    );
    expectInvalid(
      corrupted((root) => {
        vaccinationAt(root, 0).doses = { doseNumber: 1 };
      })
    );
  });

  it("G-5 vaccinationData 음성 #9 doseNumber가 0 또는 1.5면 ok: false", () => {
    expectInvalid(
      corrupted((root) => {
        doseAt(root, 1, 0).doseNumber = 0;
      })
    );
    expectInvalid(
      corrupted((root) => {
        doseAt(root, 1, 1).doseNumber = 1.5;
      })
    );
    expectInvalid(
      corrupted((root) => {
        vaccinationAt(root, 1).doses = ["1차"];
      })
    );
  });

  it("G-5 vaccinationData 음성 #10 minMonths가 -1 또는 1.5면 ok: false", () => {
    expectInvalid(
      corrupted((root) => {
        recordField(doseAt(root, 2, 0), "recommendedAge").minMonths = -1;
      })
    );
    expectInvalid(
      corrupted((root) => {
        recordField(doseAt(root, 2, 0), "recommendedAge").minMonths = 1.5;
      })
    );
    expectInvalid(
      corrupted((root) => {
        doseAt(root, 2, 0).recommendedAge = "2개월";
      })
    );
  });

  it("G-5 vaccinationData 음성 #11 maxMonths < minMonths면 ok: false", () => {
    // dtap 4차는 15~18개월이다
    expectInvalid(
      corrupted((root) => {
        recordField(doseAt(root, 2, 3), "recommendedAge").maxMonths = 14;
      })
    );
  });

  it("G-5 vaccinationData 음성 #12 maxMonths가 정수가 아니면 ok: false", () => {
    expectInvalid(
      corrupted((root) => {
        recordField(doseAt(root, 2, 3), "recommendedAge").maxMonths = 17.5;
      })
    );
    expectInvalid(
      corrupted((root) => {
        recordField(doseAt(root, 2, 3), "recommendedAge").maxMonths = "18";
      })
    );
  });

  it("U-15 vaccinationData 음성 #14 category가 없거나 national·optional이 아니면 ok: false", () => {
    expectInvalid(
      corrupted((root) => {
        delete vaccinationAt(root, 0).category;
      })
    );
    expectInvalid(
      corrupted((root) => {
        vaccinationAt(root, 2).category = "required";
      })
    );
  });

  it("U-15 vaccinationData 음성 #15 회차 category가 있는데 national·optional이 아니면 ok: false", () => {
    expectInvalid(
      corrupted((root) => {
        doseAt(root, 0, 0).category = "paid";
      })
    );
  });

  it("G-5 vaccinationData 음성 #13 recommendedAge.label이 없으면 ok: false", () => {
    expectInvalid(
      corrupted((root) => {
        delete recordField(doseAt(root, 0, 0), "recommendedAge").label;
      })
    );
  });

  it("G-5 vaccinationData loadVaccinations는 검증 실패 시 throw하고 성공 시 백신 목록을 돌려준다", () => {
    expect(() => loadVaccinations({})).toThrow(/vaccinations/);
    expect(loadVaccinations(rawData)).toEqual(VACCINATIONS);
  });
});

// R1-17 (리뷰 라운드 1): 회차 번호는 백신 안에서 유일해야 한다. 일정 항목 id·React key·testID가
// `${백신 id}-${doseNumber}`(schedule-card-hepb-2 등)라 번호가 겹치면 카드 두 장이 같은 id를 갖는다.
describe("R1-17 vaccinationData 회차 번호 중복", () => {
  it("R1-17 vaccinationData 음성: 한 백신 안에서 doseNumber가 겹치면(hepb 2차 → 1) ok: false이고 오류는 그 회차 하나를 가리킨다", () => {
    const copy = corrupted((root) => {
      doseAt(root, 1, 1).doseNumber = 1;
    });

    expectInvalid(copy);
    const result = validateVaccinationData(copy);
    if (result.ok)
      throw new Error("회차 번호가 겹친 사본은 검증에 실패해야 한다");
    expect(result.errors).toEqual([
      expect.stringContaining("vaccinations[1].doses[1].doseNumber"),
    ]);
  });
});
