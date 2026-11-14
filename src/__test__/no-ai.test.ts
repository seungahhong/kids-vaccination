/// <reference types="node" />
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

// AC-17.4(FR-13 · NFR-09 · G-10): AI 상담·네트워크 코드가 저장소에 없는지 fs로 정적 검사한다. 개발 내내 가드로 돈다.
// 아직 없는 디렉터리(예: P2 시점의 src/)는 빈 목록으로 본다.
const ROOT = join(__dirname, "..", "..");
const FORBIDDEN_SOURCE_PATTERNS: readonly RegExp[] = [
  /fetch\(/,
  /XMLHttpRequest/,
  /groq/i,
  /ChatMessage/,
];

type PackageJson = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

/** ROOT 기준 상대 경로 dir 아래의 모든 파일(재귀). 디렉터리가 없으면 빈 목록이다. */
function listFiles(dir: string): string[] {
  if (!existsSync(join(ROOT, dir))) return [];
  return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap(
    (entry) => {
      const child = join(dir, entry.name);
      return entry.isDirectory() ? listFiles(child) : [child];
    }
  );
}

/**
 * 제품 소스만 남긴다. 단위 테스트는 대상 파일 옆 __test__/(U-08), 수동 mock은 src/mocks/(U-09)에 있어 app/·src/ 안에 섞이지만
 * 제품 코드가 아니다(이 가드 자신도 src/__test__/에 있어 스캔에서 빠진다).
 */
function isProductSource(file: string): boolean {
  const segments = file.split(sep);
  return (
    !segments.includes("__test__") &&
    !(segments[0] === "src" && segments[1] === "mocks")
  );
}

it("AC-17.4 package.json의 dependencies·devDependencies에 groq-sdk가 없다", () => {
  const pkg = JSON.parse(
    readFileSync(join(ROOT, "package.json"), "utf8")
  ) as PackageJson;
  const names = [
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.devDependencies ?? {}),
  ];

  expect(names).not.toContain("groq-sdk");
});

it("AC-17.4 app/·src/의 .ts·.tsx 소스에 fetch(·XMLHttpRequest·groq·ChatMessage 문자열이 없다", () => {
  const sources = [...listFiles("app"), ...listFiles("src")].filter(
    (file) => /\.tsx?$/.test(file) && isProductSource(file)
  );
  // 범위 가드: 테스트·mock 제외가 제품 파일까지 빼지 않는다(대표 제품 파일이 스캔 목록에 있다)
  expect(sources).toEqual(
    expect.arrayContaining([
      join("src", "lib", "date.ts"),
      join("app", "(tabs)", "index.tsx"),
    ])
  );
  const hits = sources.flatMap((file) => {
    const text = readFileSync(join(ROOT, file), "utf8");
    return FORBIDDEN_SOURCE_PATTERNS.filter((pattern) =>
      pattern.test(text)
    ).map((pattern) => `${file} ← ${pattern.source}`);
  });

  expect(hits).toEqual([]);
});

it("AC-17.4 app/ 아래 파일명에 chat이 없다", () => {
  // 디렉터리 이름도 본다(app/chat/index.tsx도 /chat 라우트를 만든다)
  const chatPaths = listFiles("app")
    .map((file) => relative("app", file))
    .filter((path) => /chat/i.test(path));

  expect(chatPaths).toEqual([]);
});
