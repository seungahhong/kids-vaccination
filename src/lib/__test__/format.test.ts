import {
  DOSE_LABELS,
  formatDateRange,
  formatDisplayDate,
  formatDoseLabel,
} from "@/lib/format";
import { LOCALES } from "@/lib/locale";
import { VACCINATIONS } from "@/lib/vaccinationData";

// AC-8.4 (FR-06 · P-05 Intl 비의존): 두 TZ 모두 같은 문자열이어야 한다.
describe("AC-8.4 날짜 표시 포매터", () => {
  it.each([
    ["ko", "2024년 1월 15일"],
    ["en", "January 15, 2024"],
    ["ja", "2024年1月15日"],
    ["zh", "2024年1月15日"],
  ] as const)(
    "AC-8.4 formatDisplayDate(new Date(2024, 0, 15), %s) → %s",
    (locale, expected) => {
      expect(formatDisplayDate(new Date(2024, 0, 15), locale)).toBe(expected);
    }
  );

  it("AC-8.4 formatDateRange(2027-04-30, 2027-07-30, ko) → '2027년 4월 30일 ~ 2027년 7월 30일'", () => {
    expect(
      formatDateRange(new Date(2027, 3, 30), new Date(2027, 6, 30), "ko")
    ).toBe("2027년 4월 30일 ~ 2027년 7월 30일");
    expect(
      formatDateRange(new Date(2027, 3, 30), new Date(2027, 6, 30), "en")
    ).toBe("April 30, 2027 ~ July 30, 2027");
  });

  it("AC-8.4 end가 undefined면 시작일만 → '2027년 4월 30일'", () => {
    expect(formatDateRange(new Date(2027, 3, 30), undefined, "ko")).toBe(
      "2027년 4월 30일"
    );
  });

  it("AC-8.4 en 월 이름은 12개월 모두 영문 전체 이름이다", () => {
    const months = Array.from({ length: 12 }, (_, i) =>
      formatDisplayDate(new Date(2025, i, 1), "en")
    );

    expect(months).toEqual([
      "January 1, 2025",
      "February 1, 2025",
      "March 1, 2025",
      "April 1, 2025",
      "May 1, 2025",
      "June 1, 2025",
      "July 1, 2025",
      "August 1, 2025",
      "September 1, 2025",
      "October 1, 2025",
      "November 1, 2025",
      "December 1, 2025",
    ]);
  });
});

// AC-8.5 (FR-06 · U-07 · AD-28): 회차 표기는 로케일별 함수다. ko/ja/zh는 원본 표기식과 같고 en만 "Dose n"이다.
describe("AC-8.5 회차 표기 formatDoseLabel", () => {
  it.each([
    ["BCG(피내용)", 1, "ko", "BCG(피내용) 1차"],
    ["BCG (Intradermal)", 1, "en", "BCG (Intradermal) Dose 1"],
    ["Hib (Meningitis)", 4, "en", "Hib (Meningitis) Dose 4"],
    ["BCG（皮内用）", 1, "ja", "BCG（皮内用） 1回目"],
    ["BCG（皮内注射）", 1, "zh", "BCG（皮内注射） 1次"],
  ] as const)(
    "AC-8.5 formatDoseLabel(%s, %i, %s) → %s",
    (name, doseNumber, locale, expected) => {
      expect(formatDoseLabel(name, doseNumber, locale)).toBe(expected);
    }
  );

  it("AC-8.5 vaccinations.json 41회차 × 4개 언어 164건: ko·ja·zh는 원본 `${name} ${n}${접미사}`와 같고 en은 `${name} Dose ${n}`이다", () => {
    // 원본 src/messages/*.json의 schedule.dose 값(ko "차", ja "回目", zh "次"). en "dose"는 "1dose"가 되어 교정 대상이다.
    const ORIGINAL_DOSE_SUFFIX = { ko: "차", ja: "回目", zh: "次" } as const;
    let count = 0;

    for (const vaccination of VACCINATIONS) {
      for (const dose of vaccination.doses) {
        for (const locale of LOCALES) {
          const name = vaccination.name[locale];
          const actual = formatDoseLabel(name, dose.doseNumber, locale);
          const expected =
            locale === "en"
              ? `${name} Dose ${dose.doseNumber}`
              : `${name} ${dose.doseNumber}${ORIGINAL_DOSE_SUFFIX[locale]}`;

          expect(actual).toBe(expected);
          expect(actual).not.toMatch(/\ddose/);
          count += 1;
        }
      }
    }

    expect(count).toBe(164);
  });

  it("AC-8.5 DOSE_LABELS는 4개 언어의 회차 함수다", () => {
    expect(Object.keys(DOSE_LABELS).sort()).toEqual(["en", "ja", "ko", "zh"]);
    expect(DOSE_LABELS.ko(2)).toBe("2차");
    expect(DOSE_LABELS.en(2)).toBe("Dose 2");
    expect(DOSE_LABELS.ja(2)).toBe("2回目");
    expect(DOSE_LABELS.zh(2)).toBe("2次");
  });
});
