import en from "@/i18n/messages/en.json";
import ja from "@/i18n/messages/ja.json";
import ko from "@/i18n/messages/ko.json";
import zh from "@/i18n/messages/zh.json";
import { CATALOGS, formatMessage, localize, translate } from "@/i18n/translate";
import type { TranslationKey } from "@/i18n/types";
import type { Locale } from "@/types";

// 메시지 파일은 JSON import 타입(typeof ko)과 무관하게 "트리"로 다룬다. 그래야 키가 없는 RED 단계에서도
// 타입 오류가 아니라 단언 실패(undefined)로 드러난다(설계서 §4.4: 런타임 동일성은 테스트가 단언).
type MessageTree = Readonly<Record<string, unknown>>;

const TREES: readonly (readonly [Locale, MessageTree])[] = [
  ["ko", ko],
  ["en", en],
  ["ja", ja],
  ["zh", zh],
];

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** 2단계(namespace.leaf) dot-path 목록(정렬). 1단계 값은 그 namespace 이름만 넣는다 */
function dotPaths(tree: MessageTree): string[] {
  const paths: string[] = [];
  for (const [namespace, group] of Object.entries(tree)) {
    if (isRecord(group)) {
      for (const leaf of Object.keys(group)) paths.push(`${namespace}.${leaf}`);
    } else {
      paths.push(namespace);
    }
  }
  return paths.sort();
}

/** dot-path로 값을 찾는다. 없으면 undefined(타입이 아니라 런타임 내용을 검사) */
function lookup(tree: MessageTree, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>(
      (node, segment) => (isRecord(node) ? node[segment] : undefined),
      tree
    );
}

/** 원본 chat.disclaimer 4개 언어 값 = PRD §2.3.0-b "common.disclaimer" 행 */
const ORIGINAL_CHAT_DISCLAIMER: Readonly<Record<Locale, string>> = {
  ko: "이 정보는 참고용이며, 정확한 내용은 소아과 의사와 상담하세요.",
  en: "This information is for reference only. Please consult a pediatrician for accurate medical advice.",
  ja: "この情報は参考用です。正確な内容は小児科医にご相談ください。",
  zh: "此信息仅供参考，准确内容请咨询儿科医生。",
};

// AC-12.3 (FR-09 · US-12): 4개 파일의 dot-path 키 집합이 완전히 같고 모든 값이 비어 있지 않은 문자열이다.
describe("AC-12.3 메시지 파일 4종 — 키 집합·값", () => {
  it("AC-12.3 ko/en/ja/zh의 dot-path 키 집합이 완전히 같다", () => {
    const expected = dotPaths(ko);

    expect(expected.length).toBeGreaterThan(0);
    for (const [locale, tree] of TREES) {
      expect([locale, dotPaths(tree)]).toEqual([locale, expected]);
    }
  });

  it.each(TREES)(
    "AC-12.3 %s: 모든 키는 namespace.leaf 2단계이고 값은 비어 있지 않은 문자열이다",
    (_locale, tree) => {
      const violations: string[] = [];
      for (const [namespace, group] of Object.entries(tree)) {
        if (!isRecord(group)) {
          violations.push(`${namespace}: 1단계 값(${typeof group})`);
          continue;
        }
        for (const [leaf, value] of Object.entries(group)) {
          if (typeof value !== "string") {
            violations.push(
              `${namespace}.${leaf}: ${typeof value}(2단계 초과 또는 비문자열)`
            );
          } else if (value.trim() === "") {
            violations.push(`${namespace}.${leaf}: 빈 문자열`);
          }
        }
      }

      expect(violations).toEqual([]);
    }
  );

  it.each([
    ["ko", "곧 접종"],
    ["en", "Coming Soon"],
    ["ja", "もうすぐ"],
    ["zh", "即将接种"],
  ] as const)(
    "AC-12.3 translate(%s, 'schedule.soon') → %s",
    (locale, expected) => {
      expect(translate(locale, "schedule.soon")).toBe(expected);
    }
  );

  it("AC-12.3 CATALOGS는 로케일별로 해당 메시지 파일 객체를 그대로 담는다(satisfies Catalogs)", () => {
    expect(CATALOGS.ko).toBe(ko);
    expect(CATALOGS.en).toBe(en);
    expect(CATALOGS.ja).toBe(ja);
    expect(CATALOGS.zh).toBe(zh);
  });
});

// 지원(설계서 §4.4): 순수 조회 함수의 경계 동작. 타입상 도달할 수 없는 키는 테스트에서만 캐스트로 만든다.
describe("G-5 translate / localize 순수 함수", () => {
  it("G-5 translate는 템플릿 리터럴 키(schedule.${status})도 조회한다", () => {
    const statuses = ["past", "soon", "upcoming"] as const;

    expect(
      statuses.map((status) => translate("en", `schedule.${status}`))
    ).toEqual(["Past", "Coming Soon", "Upcoming"]);
  });

  it("G-5 translate는 카탈로그에 없는 leaf·namespace면 키 문자열을 그대로 돌려준다(런타임 방어)", () => {
    const missingLeaf = "schedule.nonexistent" as unknown as TranslationKey;
    const missingNamespace = "nonexistent.key" as unknown as TranslationKey;

    expect(translate("ko", missingLeaf)).toBe("schedule.nonexistent");
    expect(translate("ja", missingNamespace)).toBe("nonexistent.key");
  });

  it("G-5 localize(text, locale)는 해당 로케일 텍스트를 고른다", () => {
    const text = {
      ko: "BCG(피내용)",
      en: "BCG (Intradermal)",
      ja: "BCG（皮内用）",
      zh: "卡介苗(皮内注射)",
    };

    expect(
      (["ko", "en", "ja", "zh"] as const).map((locale) =>
        localize(text, locale)
      )
    ).toEqual([text.ko, text.en, text.ja, text.zh]);
  });
});

// AC-16.4 (FR-12 · US-16): common.disclaimer는 원본 chat.disclaimer 값과 같고, 최상위 chat·common.chat·schedule.askAI는 4개 파일 모두에 없다.
describe("AC-16.4 면책 문구 이동·AI 상담 키 제거", () => {
  it.each(TREES)(
    "AC-16.4 %s: common.disclaimer가 원본 chat.disclaimer 값과 같다",
    (locale, tree) => {
      expect(lookup(tree, "common.disclaimer")).toBe(
        ORIGINAL_CHAT_DISCLAIMER[locale]
      );
    }
  );

  it.each(TREES)(
    "AC-16.4 %s: 최상위 chat, common.chat, schedule.askAI가 없다",
    (_locale, tree) => {
      expect(Object.keys(tree)).not.toContain("chat");
      expect(lookup(tree, "common.chat")).toBeUndefined();
      expect(lookup(tree, "schedule.askAI")).toBeUndefined();
    }
  );
});

type ValuesByLocale = Readonly<Record<Locale, string>>;

/** PRD §2.3.0-b 신규 키(확정)·변경 키(U-06) — 키 이름과 문구는 표 그대로 */
const CONFIRMED_VALUES: readonly (readonly [string, ValuesByLocale])[] = [
  ["common.disclaimer", ORIGINAL_CHAT_DISCLAIMER],
  [
    "settings.themeLight",
    { ko: "라이트", en: "Light", ja: "ライト", zh: "浅色" },
  ],
  ["settings.themeDark", { ko: "다크", en: "Dark", ja: "ダーク", zh: "深色" }],
  [
    "home.birthdateLabel",
    { ko: "생년월일", en: "Date of birth", ja: "生年月日", zh: "出生日期" },
  ],
  [
    "home.selectBirthdate",
    {
      ko: "생년월일 선택",
      en: "Select date of birth",
      ja: "生年月日を選択",
      zh: "选择出生日期",
    },
  ],
  ["home.pickerConfirm", { ko: "확인", en: "Done", ja: "完了", zh: "确定" }],
  [
    "home.pickerCancel",
    { ko: "취소", en: "Cancel", ja: "キャンセル", zh: "取消" },
  ],
  [
    "settings.reset",
    {
      ko: "생년월일 삭제",
      en: "Delete Birthdate",
      ja: "生年月日を削除",
      zh: "删除出生日期",
    },
  ],
  [
    "settings.resetConfirm",
    {
      ko: "아기 생년월일 정보를 삭제할까요?",
      en: "Delete your baby's birthdate?",
      ja: "赤ちゃんの生年月日を削除しますか？",
      zh: "要删除宝宝的出生日期吗？",
    },
  ],
  // FR-14 접종 완료 체크(U-19·U-22): 상태 배지, 구역 제목, 체크박스 접근 이름 뒷부분
  [
    "schedule.completed",
    { ko: "완료", en: "Done", ja: "接種済み", zh: "已接种" },
  ],
  [
    "schedule.completedSection",
    {
      ko: "접종 완료",
      en: "Completed vaccinations",
      ja: "完了した接種",
      zh: "已完成接种",
    },
  ],
  [
    "schedule.markCompleted",
    { ko: "접종 완료", en: "Vaccinated", ja: "接種済み", zh: "已接种" },
  ],
  // FR-16 여러 아이(U-26~U-28): {name}·{count}·{max} 자리표시자는 formatMessage가 채운다
  [
    "settings.deleteChild",
    {
      ko: "{name} 삭제",
      en: "Delete {name}",
      ja: "{name}を削除",
      zh: "删除{name}",
    },
  ],
  [
    "settings.deleteChildConfirm",
    {
      ko: "{name} 정보를 삭제할까요?",
      en: "Delete {name}?",
      ja: "{name}の情報を削除しますか？",
      zh: "要删除{name}的信息吗？",
    },
  ],
  [
    "settings.childrenCount",
    {
      ko: "저장된 아이 {count}명 (최대 {max}명)",
      en: "{count} of {max} children saved",
      ja: "保存した子ども {count}人(最大{max}人)",
      zh: "已保存 {count} 个孩子(最多 {max} 个)",
    },
  ],
];

/** 원본 settings.reset / settings.resetConfirm 문구(U-06으로 대체됨). AC-14.2는 화면에서 0개를 관찰한다 */
const LEGACY_RESET_TEXTS: readonly string[] = [
  "데이터 초기화",
  "모든 데이터를 초기화하시겠습니까?",
  "Reset All Data",
  "Are you sure you want to reset all data?",
  "データ初期化",
  "すべてのデータを初期化しますか？",
  "重置所有数据",
  "确定要重置所有数据吗？",
];

/**
 * 최종 키 집합 = 원본 51개 − 제거 11개(chat.* 8, common.chat, schedule.askAI, schedule.dose) + 신규 8개(PRD §2.3.0-b)
 * + 리뷰 라운드 1 추가 1개(schedule.filterLabel, R1-07) + 일정 구역 제목 1개(schedule.pastSection, U-13)
 * + 분류 배지 2개(schedule.national·optional, U-15) + 접종 완료 3개(schedule.completed·completedSection·markCompleted, FR-14)
 * − 테마 "시스템" 1개(settings.themeSystem, v1.5 U-24) + 여러 아이 12개(home 7·schedule 1·settings 4, FR-16)
 * + 데이터 출처·업데이트 날짜 1개(common.dataSource)
 * + 접근성 3개(common.loading 로딩 표시 이름, schedule.markedAnnouncement·unmarkedAnnouncement 완료 체크 결과 고지, 리뷰 R4) = 70개
 */
const EXPECTED_KEYS: readonly string[] = [
  "common.appName",
  "common.loading",
  "common.home",
  "common.schedule",
  "common.settings",
  "common.disclaimer",
  "common.dataSource",
  "home.title",
  "home.subtitle",
  "home.year",
  "home.month",
  "home.day",
  "home.selectYear",
  "home.selectMonth",
  "home.selectDay",
  "home.submit",
  "home.existingBirthdate",
  "home.goToSchedule",
  "home.birthdateLabel",
  "home.selectBirthdate",
  "home.pickerConfirm",
  "home.pickerCancel",
  "home.savedChildren",
  "home.addChild",
  "home.childName",
  "home.childNamePlaceholder",
  "home.optional",
  "home.required",
  "home.childrenFull",
  "schedule.title",
  "schedule.birthdate",
  "schedule.filterAll",
  "schedule.filterUpcoming",
  "schedule.filterPast",
  "schedule.upcoming",
  "schedule.past",
  "schedule.soon",
  "schedule.detail",
  "schedule.sideEffects",
  "schedule.notes",
  "schedule.noBirthdate",
  "schedule.goHome",
  "schedule.filterLabel",
  "schedule.pastSection",
  "schedule.national",
  "schedule.optional",
  "schedule.completed",
  "schedule.completedSection",
  "schedule.markCompleted",
  "schedule.markedAnnouncement",
  "schedule.unmarkedAnnouncement",
  "schedule.childSelector",
  "settings.title",
  "settings.theme",
  "settings.darkMode",
  "settings.language",
  "settings.babyInfo",
  "settings.birthdate",
  "settings.edit",
  "settings.reset",
  "settings.resetConfirm",
  "settings.resetDone",
  "settings.cancel",
  "settings.confirm",
  "settings.themeLight",
  "settings.themeDark",
  "settings.childrenCount",
  "settings.delete",
  "settings.deleteChild",
  "settings.deleteChildConfirm",
];

// 지원(PRD §2.3.0-b 확정 표 · U-06 · U-07 · 설계서 §4.4): 신규·변경 키의 4개 언어 값, 제거 키, 최종 키 집합.
describe("G-5 §2.3.0-b 확정 번역 키(신규·변경·제거)", () => {
  it.each(CONFIRMED_VALUES)(
    "G-5 %s의 4개 언어 값은 PRD §2.3.0-b 표와 같다",
    (path, values) => {
      for (const [locale, tree] of TREES) {
        expect([locale, lookup(tree, path)]).toEqual([locale, values[locale]]);
      }
    }
  );

  it("G-5 U-06 원본 초기화 문구(데이터 초기화·모든 데이터를 초기화하시겠습니까? 계열)는 4개 파일 어디에도 없다", () => {
    for (const [locale, tree] of TREES) {
      const values = Object.values(tree).flatMap((group) =>
        isRecord(group) ? Object.values(group) : []
      );
      const legacy = values.filter(
        (value) =>
          typeof value === "string" && LEGACY_RESET_TEXTS.includes(value)
      );

      expect([locale, legacy]).toEqual([locale, []]);
    }
  });

  it("G-5 U-07 schedule.dose는 4개 파일 모두에 없다(회차 표기는 src/lib/format.ts formatDoseLabel)", () => {
    for (const [locale, tree] of TREES) {
      expect([locale, lookup(tree, "schedule.dose")]).toEqual([
        locale,
        undefined,
      ]);
    }
  });

  it("G-5 최종 키 집합은 원본 − 제거 11개 + 신규 8개 + 리뷰 추가 1개(R1-07) + U-13 추가 1개 + U-15 추가 2개 + FR-14 추가 3개 − U-24 제거 1개(settings.themeSystem) + FR-16 추가 12개 + 출처 1개(common.dataSource) + 접근성 3개(R4) = 70개와 정확히 같다(초과 키 검사)", () => {
    expect(dotPaths(ko)).toEqual([...EXPECTED_KEYS].sort());
    expect(EXPECTED_KEYS).toHaveLength(70);
  });

  it("G-5 U-24 settings.themeSystem('시스템' 테마)은 4개 파일 모두에 없다", () => {
    for (const [locale, tree] of TREES) {
      expect([locale, lookup(tree, "settings.themeSystem")]).toEqual([
        locale,
        undefined,
      ]);
    }
  });
});

// R1-07(리뷰 라운드 1): 일정 필터 tablist의 접근 이름. 화면에는 하단 탭 바도 tablist라 이름으로 구분한다.
describe("R1-07 필터 tablist 접근 이름 키", () => {
  it("R1-07 schedule.filterLabel의 4개 언어 값은 접종 상태 필터 / Vaccination status filter / 接種状況フィルター / 接种状态筛选이다", () => {
    const expected: ValuesByLocale = {
      ko: "접종 상태 필터",
      en: "Vaccination status filter",
      ja: "接種状況フィルター",
      zh: "接种状态筛选",
    };

    for (const [locale, tree] of TREES) {
      expect([locale, lookup(tree, "schedule.filterLabel")]).toEqual([
        locale,
        expected[locale],
      ]);
    }
  });
});

// U-13: "전체" 필터에서 지난 구역(아래) 앞에 두는 구역 제목.
describe("U-13 일정 지난 구역 제목 키", () => {
  it("U-13 schedule.pastSection의 4개 언어 값은 지난 접종 / Past vaccinations / 過去の接種 / 已过接种이다", () => {
    const expected: ValuesByLocale = {
      ko: "지난 접종",
      en: "Past vaccinations",
      ja: "過去の接種",
      zh: "已过接种",
    };

    for (const [locale, tree] of TREES) {
      expect([locale, lookup(tree, "schedule.pastSection")]).toEqual([
        locale,
        expected[locale],
      ]);
    }
  });
});

// U-15: 카드 분류 배지(national = 국가예방접종, optional = 기타예방접종).
describe("U-15 분류 배지 키", () => {
  it.each([
    [
      "schedule.national",
      { ko: "필수", en: "Required", ja: "定期", zh: "必需" },
    ],
    [
      "schedule.optional",
      { ko: "선택", en: "Optional", ja: "任意", zh: "可选" },
    ],
  ] as const)("U-15 %s의 4개 언어 값", (path, expected) => {
    for (const [locale, tree] of TREES) {
      expect([locale, lookup(tree, path)]).toEqual([locale, expected[locale]]);
    }
  });
});

/** 다른 AC가 의존하는 원본 키의 값(§8 P-11: 그 밖의 원본 키는 값까지 유지) */
const RETAINED_VALUES: readonly (readonly [string, ValuesByLocale])[] = [
  ["common.home", { ko: "홈", en: "Home", ja: "ホーム", zh: "首页" }],
  [
    "common.schedule",
    { ko: "접종 일정", en: "Schedule", ja: "接種日程", zh: "接种日程" },
  ],
  ["common.settings", { ko: "설정", en: "Settings", ja: "設定", zh: "设置" }],
  [
    "home.submit",
    {
      ko: "일정 확인하기",
      en: "View Schedule",
      ja: "日程を確認する",
      zh: "查看日程",
    },
  ],
  [
    "home.existingBirthdate",
    {
      ko: "이전에 입력한 생년월일이 있어요",
      en: "You've previously entered a birthdate",
      ja: "以前入力した生年月日があります",
      zh: "您之前已输入过出生日期",
    },
  ],
  [
    "schedule.title",
    {
      ko: "예방접종 일정",
      en: "Vaccination Schedule",
      ja: "予防接種日程",
      zh: "疫苗接种日程",
    },
  ],
  ["schedule.filterAll", { ko: "전체", en: "All", ja: "全て", zh: "全部" }],
  [
    "schedule.filterUpcoming",
    { ko: "예정", en: "Upcoming", ja: "予定", zh: "即将" },
  ],
  ["schedule.filterPast", { ko: "지남", en: "Past", ja: "過去", zh: "已过" }],
  ["schedule.past", { ko: "지남", en: "Past", ja: "過去", zh: "已过" }],
  ["schedule.upcoming", { ko: "예정", en: "Upcoming", ja: "予定", zh: "即将" }],
  [
    "schedule.noBirthdate",
    {
      ko: "생년월일을 먼저 입력해주세요",
      en: "Please enter a birthdate first",
      ja: "まず生年月日を入力してください",
      zh: "请先输入出生日期",
    },
  ],
  [
    "schedule.goHome",
    { ko: "홈으로 이동", en: "Go to Home", ja: "ホームへ", zh: "返回首页" },
  ],
  ["settings.title", { ko: "설정", en: "Settings", ja: "設定", zh: "设置" }],
  ["settings.confirm", { ko: "확인", en: "Confirm", ja: "確認", zh: "确认" }],
  [
    "settings.cancel",
    { ko: "취소", en: "Cancel", ja: "キャンセル", zh: "取消" },
  ],
];

// 지원(§8 P-11): 유지 키 값의 회귀 가드(탭 라벨 AC-12.1·13.x·15.4, 일정 제목·필터·배지 AC-12.2, 빈 상태 AC-14.3 등이 의존).
describe("G-5 P-11 원본 키 값 유지", () => {
  it.each(RETAINED_VALUES)(
    "G-5 %s의 4개 언어 값은 원본과 같다",
    (path, values) => {
      for (const [locale, tree] of TREES) {
        expect([locale, lookup(tree, path)]).toEqual([locale, values[locale]]);
      }
    }
  );
});

// FR-16: 문구 안 자리표시자 채우기. 언어마다 어순이 달라 문자열을 이어 붙이지 않는다
describe("G-5 formatMessage", () => {
  it("G-5 {name}·{count}·{max}를 값으로 바꾸고(숫자는 문자열로), 값이 없는 자리표시자는 그대로 둔다", () => {
    expect(formatMessage("{name} 삭제", { name: "민준" })).toBe("민준 삭제");
    expect(
      formatMessage(translate("en", "settings.childrenCount"), {
        count: 2,
        max: 10,
      })
    ).toBe("2 of 10 children saved");
    expect(formatMessage("{name}·{other}", { name: "a" })).toBe("a·{other}");
    expect(formatMessage("no placeholder", { name: "a" })).toBe(
      "no placeholder"
    );
  });

  it.each(["ko", "en", "ja", "zh"] as const)(
    "G-5 %s: FR-16 문구의 자리표시자는 {name}·{count}·{max}뿐이고 채우면 남는 중괄호가 없다",
    (locale) => {
      for (const key of [
        "settings.deleteChild",
        "settings.deleteChildConfirm",
        "settings.childrenCount",
        "home.childrenFull",
      ] as const) {
        const filled = formatMessage(translate(locale, key), {
          name: "X",
          count: 1,
          max: 10,
        });
        expect([key, filled.includes("{")]).toEqual([key, false]);
      }
    }
  );
});
