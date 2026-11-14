/// <reference types="node" />
import { readFileSync } from "node:fs";
import { join } from "node:path";

import rawData from "@/data/vaccinations.json";
import en from "@/i18n/messages/en.json";
import ja from "@/i18n/messages/ja.json";
import ko from "@/i18n/messages/ko.json";
import zh from "@/i18n/messages/zh.json";

// R1-14 (리뷰 라운드 1): 웹 SPA 템플릿 public/index.html의 정적 내용 점검. 템플릿은 dev 서버 응답과 `expo export` 산출물에
// 그대로 실리므로 (1) 데이터 수치·앱 이름·면책 문구가 실제 데이터·번역과 같아야 하고, (2) 개발용 내부 주석이 없어야 하며,
// (3) JavaScript가 꺼진 환경에서 noscript 요약이 잘리지 않아야 한다(실제 렌더와 스크롤은 e2e/review-r1-home.spec.ts가 본다).

const HTML = readFileSync(
  join(__dirname, "..", "..", "public", "index.html"),
  "utf8"
);

/** 실제 데이터의 백신 종류 수와 회차 합(검증기와 독립적으로 원본 JSON에서 센다) */
const VACCINE_COUNT = rawData.vaccinations.length;
const DOSE_COUNT = rawData.vaccinations.reduce(
  (sum, vaccination) => sum + vaccination.doses.length,
  0
);

/** pattern(전역 플래그, 캡처 그룹 1개)의 모든 일치에서 첫 캡처 그룹을 모은다 */
function captures(text: string, pattern: RegExp): string[] {
  return Array.from(text.matchAll(pattern), (match) => match[1] ?? "");
}

/** 첫 일치의 캡처 그룹 1. 없으면 실패한다 */
function capture(text: string, pattern: RegExp, label: string): string {
  const value = pattern.exec(text)?.[1];
  if (value === undefined) throw new Error(`index.html에 ${label}이(가) 없다`);
  return value;
}

type JsonLd = {
  name?: unknown;
  alternateName?: unknown;
  description?: unknown;
  featureList?: unknown;
  usageInfo?: { text?: unknown };
};

function jsonLd(): JsonLd {
  return JSON.parse(
    capture(
      HTML,
      /<script type="application\/ld\+json">([\s\S]*?)<\/script>/,
      "JSON-LD"
    )
  ) as JsonLd;
}

const HEAD = capture(HTML, /<head>([\s\S]*?)<\/head>/, "<head>");
const BODY = capture(HTML, /<body>([\s\S]*?)<\/body>/, "<body>");

describe("R1-14 웹 템플릿 public/index.html", () => {
  it(`R1-14 'N종'·'N회차' 수치는 모두 vaccinations.json의 백신 수(${VACCINE_COUNT})·회차 합(${DOSE_COUNT})과 같다`, () => {
    const kinds = captures(HTML, /(\d+)종/g);
    const doses = captures(HTML, /(\d+)회차/g);

    // 빈 검사로 통과하지 않도록 각 수치가 1곳 이상 있어야 한다(description·og·JSON-LD·noscript)
    expect(kinds.length).toBeGreaterThanOrEqual(1);
    expect(doses.length).toBeGreaterThanOrEqual(1);
    expect(new Set(kinds)).toEqual(new Set([String(VACCINE_COUNT)]));
    expect(new Set(doses)).toEqual(new Set([String(DOSE_COUNT)]));
  });

  it("R1-14 앱 이름(title·og:title·JSON-LD name·noscript h1)은 ko common.appName, JSON-LD alternateName은 en·ja·zh common.appName, 면책 문구(JSON-LD·noscript)는 ko common.disclaimer와 같다", () => {
    const data = jsonLd();

    expect(capture(HEAD, /<title>([^<]*)<\/title>/, "<title>")).toBe(
      ko.common.appName
    );
    expect(
      capture(HEAD, /<meta property="og:title" content="([^"]*)"/, "og:title")
    ).toBe(ko.common.appName);
    expect(data.name).toBe(ko.common.appName);
    expect(capture(BODY, /<h1>([^<]*)<\/h1>/, "noscript h1")).toBe(
      ko.common.appName
    );
    expect(data.alternateName).toEqual([
      en.common.appName,
      ja.common.appName,
      zh.common.appName,
    ]);
    expect(data.usageInfo?.text).toBe(ko.common.disclaimer);
    // 문단은 Prettier가 줄을 나눌 수 있으므로 공백을 하나로 모아 비교한다
    expect(
      captures(BODY, /<p>([^<]*)<\/p>/g).map((text) =>
        text.replace(/\s+/g, " ").trim()
      )
    ).toContain(ko.common.disclaimer);
  });

  it("R1-14 HTML·CSS 주석에 개발용 내부 정보(소스 경로·요구사항 ID·명령·한국어 작업 메모)가 없다", () => {
    const comments = [
      ...captures(HTML, /<!--([\s\S]*?)-->/g),
      ...captures(HTML, /\/\*([\s\S]*?)\*\//g),
    ];
    const internal = comments.filter((comment) =>
      [
        /src\//,
        /\.(?:ts|tsx|js)\b/,
        /\b(?:AC|FR|NFR|G|P|R1)-\d/,
        /\b(?:npx|npm)\b|expo customize/,
        /[가-힣]/,
      ].some((pattern) => pattern.test(comment))
    );

    // Expo 기본 템플릿의 영어 안내 주석(RNW 스타일 리셋·root 요소)만 남는다
    expect(comments.length).toBeGreaterThan(0);
    expect(internal).toEqual([]);
  });

  it("R1-14 JavaScript가 꺼지면 head의 noscript 스타일이 문서 스크롤을 다시 켜고 빈 #root를 숨긴다(noscript 요약이 body overflow:hidden에 잘리지 않게)", () => {
    const noscriptStyle = capture(
      HEAD,
      /<noscript>\s*<style>([\s\S]*?)<\/style>\s*<\/noscript>/,
      "head의 <noscript><style>"
    );

    expect(noscriptStyle).toMatch(
      /body\s*\{[^}]*overflow\s*:\s*(?:auto|visible|scroll)\b/
    );
    expect(noscriptStyle).toMatch(/#root\s*\{[^}]*display\s*:\s*none\b/);
    // JS가 켜진 앱 화면의 스크롤 리셋(RNW 권장)은 그대로다
    expect(HEAD).toMatch(
      /<style id="expo-reset">[\s\S]*body\s*\{\s*overflow:\s*hidden;/
    );
  });
});
