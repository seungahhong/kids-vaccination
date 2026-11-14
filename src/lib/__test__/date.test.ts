import {
  addDays,
  addMonthsClamped,
  BIRTHDATE_YEAR_SPAN,
  compareDay,
  getBirthdateRange,
  isIsoDate,
  isoDateToDate,
  isSelectableBirthdate,
  isWithinRange,
  parseIsoDate,
  startOfDay,
  toIsoDate,
} from "@/lib/date";
import { day, FIXED_NOW } from "../../../test-utils/render";

// AC-4.1 (FR-03 · T6 결함 1: UTC 파싱). 두 TZ(Asia/Seoul, America/New_York)에서 같은 결과여야 한다.
describe("AC-4.1 ISO 날짜 파서/포매터", () => {
  it("AC-4.1 parseIsoDate('2024-01-15')는 두 TZ 모두 로컬 자정 2024-01-15 Date를 반환한다", () => {
    const parsed = parseIsoDate("2024-01-15");

    expect(parsed).not.toBeNull();
    expect(parsed?.getFullYear()).toBe(2024);
    expect(parsed?.getMonth()).toBe(0);
    expect(parsed?.getDate()).toBe(15);
    expect(parsed?.getHours()).toBe(0);
    expect(parsed?.getMinutes()).toBe(0);
  });

  it("AC-4.1 toIsoDate(new Date(2024, 0, 5))는 '2024-01-05'다(0 패딩)", () => {
    expect(toIsoDate(new Date(2024, 0, 5))).toBe("2024-01-05");
    expect(toIsoDate(new Date(2026, 9, 18, 15, 0, 0))).toBe("2026-10-18");
  });

  it.each(["2024-02-30", "2024-13-01", "20240131", "abc", ""])(
    "AC-4.1 parseIsoDate(%j)는 null을 반환한다(달력 무효·형식 불일치)",
    (input) => {
      expect(parseIsoDate(input)).toBeNull();
    }
  );

  it("AC-4.1 isIsoDate는 parseIsoDate 성공 여부와 같고 isoDateToDate는 브랜드 문자열을 로컬 자정으로 되돌린다", () => {
    expect(isIsoDate("2024-01-15")).toBe(true);
    expect(isIsoDate("2024-02-30")).toBe(false);

    const value = "2024-02-29";
    if (!isIsoDate(value)) throw new Error("2024-02-29는 유효한 날짜여야 한다");
    const date = isoDateToDate(value);
    expect([date.getFullYear(), date.getMonth(), date.getDate()]).toEqual([
      2024, 1, 29,
    ]);
    expect(toIsoDate(date)).toBe(value);
  });
});

// AC-4.2 (FR-03 · T6 결함 2: 말일 오버플로 + 원본 addMonthsToDate 3건 의도 이식)
describe("AC-4.2 말일 고정 월 덧셈 addMonthsClamped", () => {
  it.each([
    ["2024-01-31", 1, "2024-02-29"],
    ["2023-01-31", 1, "2023-02-28"],
    ["2024-03-31", 1, "2024-04-30"],
    ["2024-08-31", 6, "2025-02-28"],
    ["2024-01-15", 2, "2024-03-15"],
    ["2024-11-15", 3, "2025-02-15"],
    ["2024-03-15", 0, "2024-03-15"],
  ])("AC-4.2 addMonthsClamped(%s, +%i) → %s", (input, months, expected) => {
    expect(toIsoDate(addMonthsClamped(day(input), months))).toBe(expected);
  });

  it("AC-4.2 입력 Date는 변경되지 않는다", () => {
    const input = day("2024-01-31");
    const before = input.getTime();

    addMonthsClamped(input, 1);

    expect(input.getTime()).toBe(before);
    expect(toIsoDate(input)).toBe("2024-01-31");
  });
});

// AC-1.6 (FR-01 · U-05): 하한 (현재 연도 − 9)년 1월 1일, 상한 오늘. 두 TZ 모두 동일.
describe("AC-1.6 생년월일 허용 범위", () => {
  it("AC-1.6 now = 2026-10-18 15:00이면 하한 '2017-01-01'(현재 연도 − 9년 1월 1일), 상한 '2026-10-18'이다", () => {
    const range = getBirthdateRange(FIXED_NOW);

    expect(BIRTHDATE_YEAR_SPAN).toBe(10);
    expect(toIsoDate(range.min)).toBe("2017-01-01");
    expect(toIsoDate(range.max)).toBe("2026-10-18");
    // 둘 다 로컬 자정
    expect(range.min.getHours()).toBe(0);
    expect(range.max.getHours()).toBe(0);
  });

  it.each([
    ["2016-12-31", false],
    ["2017-01-01", true],
    ["2026-10-18", true],
    ["2026-10-19", false],
  ])(
    "AC-1.6 now = 2026-10-18일 때 isSelectableBirthdate(%s) → %s",
    (value, expected) => {
      expect(isSelectableBirthdate(value, FIXED_NOW)).toBe(expected);
    }
  );

  it("AC-1.6 now = 2027-01-01 00:30이면 하한 '2018-01-01', 상한 '2027-01-01'이고 2017-12-31→false, 2018-01-01→true다", () => {
    const now = new Date(2027, 0, 1, 0, 30);
    const range = getBirthdateRange(now);

    expect(toIsoDate(range.min)).toBe("2018-01-01");
    expect(toIsoDate(range.max)).toBe("2027-01-01");
    expect(isSelectableBirthdate("2017-12-31", now)).toBe(false);
    expect(isSelectableBirthdate("2018-01-01", now)).toBe(true);
  });

  it("AC-1.6 형식이 틀리거나 달력상 무효인 문자열은 선택할 수 없다", () => {
    expect(isSelectableBirthdate("abc", FIXED_NOW)).toBe(false);
    expect(isSelectableBirthdate("2024-02-30", FIXED_NOW)).toBe(false);
  });

  it("AC-1.6 isWithinRange는 양 끝을 포함하는 일 단위 판정이다(시각 무시)", () => {
    const range = getBirthdateRange(FIXED_NOW);

    expect(isWithinRange(new Date(2017, 0, 1, 23, 59), range)).toBe(true);
    expect(isWithinRange(new Date(2026, 9, 18, 23, 59), range)).toBe(true);
    expect(isWithinRange(new Date(2016, 11, 31, 23, 59), range)).toBe(false);
    expect(isWithinRange(new Date(2026, 9, 19, 0, 0), range)).toBe(false);
  });
});

// R1-01 (리뷰 라운드 1): 웹 날짜 입력에 키보드로 연도를 치면 브라우저 값이 "0002-03-15"처럼 0~99년을 거친다.
// Date 생성자는 0~99년을 1900~1999년으로 바꾸므로(ECMAScript MakeFullYear) 그 해 그대로 읽어야 하고,
// toIsoDate는 연도를 4자리로 채워 'YYYY-MM-DD' 왕복을 지킨다. 그런 날짜도 생년월일 허용 범위 밖이라 제출되지 않는다.
describe("R1-01 0~99년 날짜와 4자리 연도", () => {
  /** year년 monthIndex월 day일 로컬 자정(0~99년 포함). 생성자의 1900년대 변환을 피하려고 setFullYear로 만든다 */
  function dateInYear(year: number, monthIndex: number, day: number): Date {
    const date = new Date(2000, 0, 1);
    date.setFullYear(year, monthIndex, day);
    return date;
  }

  it.each([
    ["0002-03-15", [2, 2, 15]],
    ["0020-03-15", [20, 2, 15]],
    ["0099-12-31", [99, 11, 31]],
    ["0004-02-29", [4, 1, 29]],
  ] as const)(
    "R1-01 parseIsoDate(%j)는 1900년대로 바꾸지 않고 그 해 로컬 자정 %j(연·월 인덱스·일)이다",
    (input, [year, monthIndex, date]) => {
      const parsed = parseIsoDate(input);

      expect(parsed).not.toBeNull();
      expect([
        parsed?.getFullYear(),
        parsed?.getMonth(),
        parsed?.getDate(),
        parsed?.getHours(),
      ]).toEqual([year, monthIndex, date, 0]);
    }
  );

  it("R1-01 0~99년도 달력 검증은 그대로다: 2년 2월 29일(평년)은 null이다", () => {
    expect(parseIsoDate("0002-02-29")).toBeNull();
    expect(isIsoDate("0002-02-29")).toBe(false);
  });

  it("R1-01 toIsoDate는 연도를 4자리로 채운다(2년 → '0002', 202년 → '0202')", () => {
    expect(toIsoDate(dateInYear(2, 2, 15))).toBe("0002-03-15");
    expect(toIsoDate(dateInYear(202, 0, 5))).toBe("0202-01-05");
  });

  it("R1-01 isoDateToDate·startOfDay·addDays·addMonthsClamped도 0~99년을 유지하고, 그 날짜는 생년월일 허용 범위 밖이다", () => {
    const value = "0002-03-15";
    if (!isIsoDate(value)) throw new Error("0002-03-15는 유효한 날짜여야 한다");

    const date = isoDateToDate(value);
    expect(date.getFullYear()).toBe(2);
    expect(toIsoDate(date)).toBe(value);
    expect(toIsoDate(startOfDay(date))).toBe(value);
    expect(toIsoDate(addDays(date, 17))).toBe("0002-04-01");
    // 4년은 윤년(그레고리력 소급)이라 1월 31일 + 1개월은 2월 29일로 고정된다
    expect(toIsoDate(addMonthsClamped(day("0004-01-31"), 1))).toBe(
      "0004-02-29"
    );
    expect(isSelectableBirthdate(value, FIXED_NOW)).toBe(false);
  });
});

// 지원(G-5 커버리지 · 설계서 §5.1): 일 단위 기본 연산. DST 경유 덧셈은 AC-5.2가 상태 판정으로 확인한다.
describe("G-5 date 기본 연산", () => {
  it("G-5 startOfDay는 로컬 자정으로 자르고 addDays는 달력 일 덧셈이다(2026-10-18 + 31 → 2026-11-18)", () => {
    const start = startOfDay(FIXED_NOW);

    expect(toIsoDate(start)).toBe("2026-10-18");
    expect([start.getHours(), start.getMinutes(), start.getSeconds()]).toEqual([
      0, 0, 0,
    ]);
    expect(toIsoDate(addDays(start, 30))).toBe("2026-11-17");
    expect(toIsoDate(addDays(start, 31))).toBe("2026-11-18");
    expect(toIsoDate(addDays(start, -18))).toBe("2026-09-30");
  });

  it("G-5 compareDay는 로컬 Y/M/D만 비교해 -1 / 0 / 1을 반환한다", () => {
    expect(
      compareDay(new Date(2026, 9, 17, 23), new Date(2026, 9, 18, 0))
    ).toBe(-1);
    expect(
      compareDay(new Date(2026, 9, 18, 0), new Date(2026, 9, 18, 23))
    ).toBe(0);
    expect(
      compareDay(new Date(2026, 9, 19, 0), new Date(2026, 9, 18, 23))
    ).toBe(1);
  });
});
