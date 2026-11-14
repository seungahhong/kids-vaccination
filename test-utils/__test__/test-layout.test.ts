/// <reference types="node" />
import { existsSync, readdirSync } from "node:fs";
import { basename, join, sep } from "node:path";

// 테스트·mock 위치 규칙(사용자 결정 U-08·U-09·U-17·U-18)을 저장소 정적 검사로 강제한다(리뷰 R3-05, no-ai.test.ts와 같은 fs 방식).
// - 테스트 폴더 이름은 __test__다(U-17, 2026-11-07). __tests__는 두지 않는다.
// - 라우트 화면 통합 테스트도 대상 라우트 옆 app/(tabs)/__test__/에 둔다(U-17). Metro 기본 blockList는 __tests__(복수)만 빼므로
//   metro.config.js가 __test__/를 막아야 앱 번들에 들어가지 않는다. __test__ 밖의 맨 *.test.*·*.spec.*는 expo-router의
//   require.context에 걸려 실제 라우트로 번들된다. jest의 renderApp도 test-utils/render.tsx의 appRoutes()로 __test__/를 라우트에서 뺀다.
//   expo-router typegen(.expo/types/router.d.ts)은 이 파일들을 /__test__/… href로 계속 만든다(설정으로 끌 수 없음, 타입에만 영향).
// - 수동 mock은 src/mocks/<패키지 이름>에 두고 jest.setup.ts의 jest.mock 팩토리로 연결한다. 루트 __mocks__/는 두지 않는다.
// - 루트 __test__/는 두지 않는다(U-18, 2026-11-07). 환경 스모크·TZ·이 가드는 test-utils/__test__/, 제품 소스 가드(no-ai)와
//   public/index.html 검사는 src/__test__/, tsc 전용 타입 테스트는 src/types/__test__/에 둔다.
// - public/에는 테스트를 두지 않는다. expo export가 public/을 그대로 dist에 복사해 테스트 파일이 배포된다.
const ROOT = join(__dirname, "..", "..");
const TEST_DIR = "__test__";
const SCANNED_DIRS: readonly string[] = ["app", "src", "test-utils", "e2e"];
const TEST_FILE_NAME = /\.(test|spec)\./;

type Entry = { readonly path: string; readonly isDirectory: boolean };

/** ROOT 기준 상대 경로 dir 아래의 모든 파일·디렉터리(재귀). 디렉터리가 없으면 빈 목록이다 */
function listEntries(dir: string): Entry[] {
  if (!existsSync(join(ROOT, dir))) return [];
  return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap(
    (entry): Entry[] => {
      const path = join(dir, entry.name);
      return entry.isDirectory()
        ? [{ path, isDirectory: true }, ...listEntries(path)]
        : [{ path, isDirectory: false }];
    }
  );
}

const inTestDir = (path: string): boolean => path.split(sep).includes(TEST_DIR);

describe("R3-05 테스트·mock 위치 규칙(U-08·U-09·U-17·U-18)", () => {
  it("U-17 app/의 *.test.*·*.spec.* 파일은 __test__/ 안에만 있다(밖에 두면 라우트로 번들된다)", () => {
    const files = listEntries("app").filter(({ isDirectory }) => !isDirectory);
    // 범위 가드: 스캔이 실제 라우트 파일과 라우트 화면 테스트를 본다(빈 목록으로 통과하지 않는다)
    expect(files.map(({ path }) => path)).toEqual(
      expect.arrayContaining([
        join("app", "(tabs)", "index.tsx"),
        join("app", "(tabs)", TEST_DIR, "home.test.tsx"),
      ])
    );

    const misplaced = files
      .filter(
        ({ path }) => TEST_FILE_NAME.test(basename(path)) && !inTestDir(path)
      )
      .map(({ path }) => path);

    expect(misplaced).toEqual([]);
  });

  it("U-17 metro.config.js의 blockList가 app/**/__test__/를 막고 라우트 파일은 막지 않는다", () => {
    // CommonJS Metro 설정을 그대로 읽는다(expo/metro-config의 기본 blockList 포함)
    const config: { resolver: { blockList: RegExp | RegExp[] } } = require(
      join(ROOT, "metro.config.js")
    );
    const blockList = [config.resolver.blockList].flat();
    const isBlocked = (path: string): boolean =>
      blockList.some((pattern) => pattern.test(join(ROOT, path)));

    expect(isBlocked(join("app", "(tabs)", TEST_DIR, "home.test.tsx"))).toBe(
      true
    );
    expect(isBlocked(join("app", "(tabs)", "index.tsx"))).toBe(false);
  });

  it("U-17 테스트 폴더 이름은 __test__다(__tests__ 디렉터리가 없다)", () => {
    const rootDirs = readdirSync(ROOT, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
    const dirs = SCANNED_DIRS.flatMap(listEntries)
      .filter(({ isDirectory }) => isDirectory)
      .map(({ path }) => basename(path));
    // 범위 가드: 스캔이 대상 옆 __test__/를 본다
    expect(dirs).toContain(TEST_DIR);

    expect(
      [...rootDirs, ...dirs].filter((name) => name === "__tests__")
    ).toEqual([]);
  });

  it("R3-05 루트에 __mocks__/가 없다(수동 mock은 src/mocks/<패키지 이름>에 두고 jest.setup.ts가 연결한다)", () => {
    expect(existsSync(join(ROOT, "__mocks__"))).toBe(false);
  });

  it("U-18 루트에 __test__/가 없다(모든 테스트는 대상 폴더 옆 __test__/에 둔다)", () => {
    // 범위 가드: 이 가드 자신이 대상 폴더 옆 __test__/에 있다
    expect(
      existsSync(join(ROOT, "test-utils", TEST_DIR, basename(__filename)))
    ).toBe(true);

    expect(existsSync(join(ROOT, TEST_DIR))).toBe(false);
  });

  it("U-18 public/에 __test__/와 *.test.*·*.spec.* 파일이 없다(expo export가 public/을 dist에 그대로 복사한다)", () => {
    const entries = listEntries("public");
    // 범위 가드: 스캔이 웹 템플릿을 본다
    expect(entries.map(({ path }) => path)).toContain(
      join("public", "index.html")
    );

    const misplaced = entries
      .filter(({ path, isDirectory }) =>
        isDirectory
          ? basename(path) === TEST_DIR
          : TEST_FILE_NAME.test(basename(path))
      )
      .map(({ path }) => path);

    expect(misplaced).toEqual([]);
  });
});
