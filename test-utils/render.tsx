/// <reference types="node" />
// 테스트 공용 유틸(jest testMatch 밖). Phase별 단계 성장(설계서 §9.4):
//   P2: FIXED_NOW → P4: deferStorage·seedStorage → P7: renderWithProviders·renderApp
// 각 단계는 그 시점에 존재하는 모듈만 import한다.
// 여러 테스트 파일에 같은 내용으로 복사돼 있던 헬퍼(대기·mock 복원·날짜 입력·탭 조회)도 여기에 둔다.
// 설정 화면 열기(openSettings)와 호스트 포커스 탐침(hostWithProps·sharedHostFocus)은 설정 화면 테스트와
// roving 훅 테스트(src/hooks/__test__/useRovingFocus.test.tsx)가 함께 쓴다(리뷰 R2-04, U-08 이동).
// 배치 완료 흉내(fireLayout)는 설정 화면 테스트와 아기 정보 섹션 테스트가 함께 쓴다(V-01).
// ScrollView 조상 찾기(closestScrollView)는 홈 화면 테스트와 Screen 컴포넌트 테스트가 함께 쓴다(리뷰 R3-02, U-08 이동).
// 이 파일 자체의 테스트(renderWithProviders의 now 주입)는 test-utils/__test__/render.test.tsx에 있다.
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  act,
  fireEvent,
  render,
  type RenderResult,
  screen,
  within,
} from "@testing-library/react-native";
import {
  type MockContextConfig,
  renderRouter,
  type RenderRouterResult,
} from "expo-router/testing-library";
import { readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { createRef, type ReactElement, type ReactNode } from "react";
import * as ReactNative from "react-native";
import { type HostInstance, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { LoadingGate } from "@/components/common/LoadingGate";
import { BirthdateProvider } from "@/contexts/BirthdateContext";
import { I18nProvider } from "@/contexts/I18nContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { ClockContext } from "@/hooks/useToday";
import { parseIsoDate } from "@/lib/date";
import type { StorageKey } from "@/lib/storage";

/** ENV-TDD 기본 주입 시각: 로컬 2026-10-18 15:00(PRD §2.3.0). 공유 객체이므로 변경하지 말 것. */
export const FIXED_NOW = new Date(2026, 9, 18, 15, 0, 0);

/** 테스트 입력용: 유효한 ISO 문자열을 로컬 자정 Date로(무효면 즉시 실패) */
export function day(iso: string): Date {
  const parsed = parseIsoDate(iso);
  if (!parsed) throw new Error(`테스트 입력이 유효한 날짜가 아니다: ${iso}`);
  return parsed;
}

type Deferred = {
  readonly promise: Promise<string | null>;
  readonly resolve: (value: string | null) => void;
};

function createDeferred(): Deferred {
  let resolve: (value: string | null) => void = () => {};
  const promise = new Promise<string | null>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

/**
 * AsyncStorage.getItem을 주어진 키에 한해 "resolve(key, value)를 부를 때까지 끝나지 않는" Promise로 바꾼다(AC-3.3, 10.2, 하이드레이션 경합).
 * 목록에 없는 키는 기본 mock 구현(내부 저장소)대로 동작한다. resolve는 React 상태 갱신까지 act로 비운다.
 * 다음 테스트 전에 jest.setup.ts가 getItem의 기본 구현을 복원한다.
 */
export function deferStorage(keys: readonly StorageKey[]): {
  resolve(key: StorageKey, value: string | null): Promise<void>;
} {
  const getItem = jest.mocked(AsyncStorage.getItem);
  const original = getItem.getMockImplementation();
  const pending = new Map<string, Deferred>(
    keys.map((key) => [key, createDeferred()] as const)
  );

  getItem.mockImplementation((key, callback) => {
    const deferred = pending.get(key);
    if (deferred) return deferred.promise;
    return original ? original(key, callback) : Promise.resolve(null);
  });

  return {
    async resolve(key, value) {
      const deferred = pending.get(key);
      if (!deferred) {
        throw new Error(`deferStorage: '${key}'는 지연 대상 키가 아닙니다`);
      }
      await act(async () => {
        deferred.resolve(value);
        await deferred.promise;
      });
    },
  };
}

/**
 * 저장값을 미리 넣는다(E2E의 seed와 같은 역할). setItem이 아니라 multiSet으로 넣어
 * "setItem 0회"(AC-13.4, 18.4) 단언이 시드 호출에 오염되지 않게 한다.
 */
export async function seedStorage(
  values: Partial<Record<StorageKey, string>>
): Promise<void> {
  const entries: [string, string][] = [];
  for (const [key, value] of Object.entries(values)) {
    if (typeof value === "string") entries.push([key, value]);
  }
  if (entries.length > 0) await AsyncStorage.multiSet(entries);
}

/** 비동기 저장(키별 큐 → AsyncStorage mock)이 끝나도록 매크로태스크 1회(setTimeout 0)를 기다린다(실제 타이머) */
export const flushMacrotask = () =>
  new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * renderApp 뒤에 쓰는 flushMacrotask. renderRouter(expo-router/testing-library)는 jest.useFakeTimers()를 켜고 되돌리지 않으므로(실측)
 * 실제 대기 대신 act 안에서 타이머를 0ms 진행시켜 setTimeout 0을 발화시킨다. 진행시키지 않으면 영원히 끝나지 않는다.
 */
export const flushRouterMacrotask = () =>
  act(async () => {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
      jest.advanceTimersByTime(0);
    });
  });

/**
 * jest 프리셋의 RN mock(useColorScheme, AppState.addEventListener)은 이미 jest.fn이라 jest.spyOn이 같은 mock을 돌려주고,
 * Jest 30의 restoreAllMocks는 spy가 아닌 mock의 호출 기록·구현을 되돌리지 않는다(jest.setup.ts와 같은 상황, F-07).
 * 그래서 지금의 기본 구현을 스냅숏해 두고 테스트마다 afterEach에서 직접 복원한다. 테스트 파일 최상위에서 1회 부른다.
 */
export function restoreDefaultImplementationAfterEach<T, Y extends unknown[]>(
  mock: jest.MockInstance<T, Y>
): void {
  const defaultImplementation = mock.getMockImplementation();
  afterEach(() => {
    mock.mockReset();
    if (defaultImplementation) mock.mockImplementation(defaultImplementation);
  });
}

/** OS 색 모드(useColorScheme) mock 반환값을 바꾼다(AC-11.5 네이티브 경로·설정 화면 거울) */
export function mockSystemScheme(
  scheme: ReturnType<typeof ReactNative.useColorScheme>
) {
  return jest.spyOn(ReactNative, "useColorScheme").mockReturnValue(scheme);
}

type ChangeListener = (state: ReactNative.AppStateStatus) => void;

/** AppState.addEventListener를 가로채 'change' 리스너에 상태를 직접 전달한다(설계서 §5.6) */
export function spyAppState() {
  const listeners: ChangeListener[] = [];
  const remove = jest.fn();
  const addEventListener = jest.spyOn(ReactNative.AppState, "addEventListener");
  addEventListener.mockClear();
  addEventListener.mockImplementation((type, handler) => {
    if (type === "change") listeners.push(handler);
    return { remove };
  });
  const emit = async (state: ReactNative.AppStateStatus) => {
    await act(async () => {
      for (const listener of listeners) listener(state);
    });
  };
  return { listeners, remove, addEventListener, emit };
}

/** 하단 탭의 한국어 접근 이름(탭 순서) */
export const TAB_NAMES_KO = ["홈", "접종 일정", "설정"] as const;

/** RNTL 질의가 돌려주는 호스트 요소 */
export type HostElement = ReturnType<typeof screen.getByTestId>;

/** element부터 위로 올라가며 처음 만나는 ScrollView 호스트(RN jest mock의 RCTScrollView). 없으면 null */
export function closestScrollView(element: HostElement): HostElement | null {
  for (let node: HostElement | null = element; node; node = node.parent) {
    if (node.type === "RCTScrollView") return node;
  }
  return null;
}

/** 이름이 names 중 하나인 하단 탭 버튼을 문서 순서로 돌려준다(iOS 프리셋 host role은 button. 다른 버튼과 구분하려고 이름으로 한정, P7 메모) */
export function getTabButtons(names: readonly string[]) {
  return screen.getAllByRole("button", {
    name: new RegExp(`^(${names.join("|")})$`),
  });
}

/** 주입 시계: Date면 고정 시각, 함수면 호출마다 시각을 바꿀 수 있다(AC-5.6 앱 복귀 시 날짜 변경) */
export type Clock = Date | (() => Date);

/**
 * Date는 () => date로 한 번만 감싸 ClockContext value의 함수 참조를 안정시킨다
 * (useToday의 effect 의존성이 getNow라 매 렌더 새 함수면 재구독한다, 설계서 §5.6).
 */
function toGetNow(now: Clock | undefined): () => Date {
  if (typeof now === "function") return now;
  const fixed = now ?? FIXED_NOW;
  return () => fixed;
}

/** getNow를 ClockContext로 주입하는 wrapper 컴포넌트(renderHook·renderRouter의 wrapper 옵션용) */
export function createClockWrapper(getNow: () => Date) {
  return function ClockWrapper({ children }: { children: ReactNode }) {
    return (
      <ClockContext.Provider value={getNow}>{children}</ClockContext.Provider>
    );
  };
}

/**
 * 화면·컴포넌트 단위 렌더: Clock → SafeArea → Theme → I18n → Birthdate → LoadingGate → ui
 * (루트 레이아웃과 같은 Provider 순서, nav theme·Slot 제외). 하이드레이션 전에는 loading-gate가 보이므로
 * 단언은 findBy*로 기다리거나 deferStorage로 시점을 제어한다.
 */
export async function renderWithProviders(
  ui: ReactElement,
  options: { now?: Clock } = {}
): Promise<RenderResult> {
  const getNow = toGetNow(options.now);
  function ProvidersWrapper({ children }: { children: ReactNode }) {
    return (
      <ClockContext.Provider value={getNow}>
        <SafeAreaProvider>
          <ThemeProvider>
            <I18nProvider>
              <BirthdateProvider>
                <LoadingGate>{children}</LoadingGate>
              </BirthdateProvider>
            </I18nProvider>
          </ThemeProvider>
        </SafeAreaProvider>
      </ClockContext.Provider>
    );
  }
  return render(ui, { wrapper: ProvidersWrapper });
}

const APP_DIR = join(__dirname, "..", "app");
const ROUTE_FILE = /\.[tj]sx?$/;
/** 대상 파일 옆 테스트 폴더 이름. app/ 안의 이 폴더는 라우트가 아니다(앱 번들에서는 metro.config.js의 blockList가 뺀다) */
export const TEST_DIR = "__test__";

/**
 * app/의 라우트 파일을 renderRouter의 메모리 컨텍스트 형식(확장자 없는 키 → 모듈)으로 모은다. __test__/ 폴더는 뺀다.
 * renderRouter("./app")는 app/ 아래 .ts/.tsx를 모두 라우트로 읽으므로 app/(tabs)/__test__/의 화면 테스트 파일이
 * 탭 그룹의 /__test__/… 라우트로 들어가, Metro가 이 폴더를 빼는 실제 앱과 라우트 트리가 달라진다(실측).
 * 모듈은 expo-router가 라우트를 불러올 때(loadRoute) require한다(renderRouter("./app")와 같은 시점).
 */
export function appRoutes(): MockContextConfig {
  const routes: MockContextConfig = {};
  const collect = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== TEST_DIR) collect(path);
      } else if (ROUTE_FILE.test(entry.name)) {
        const key = relative(APP_DIR, path)
          .split(sep)
          .join("/")
          .replace(ROUTE_FILE, "");
        Object.defineProperty(routes, key, {
          enumerable: true,
          get: () => require(path),
        });
      }
    }
  };
  collect(APP_DIR);
  return routes;
}

/**
 * 실제 app/ 디렉터리를 renderRouter로 로드한다(루트 레이아웃·게이트·탭 포함, 설계서 §9.5). __test__/는 라우트에서 뺀다(appRoutes).
 * 시계는 wrapper의 ClockContext로 주입한다(기본 FIXED_NOW).
 */
export async function renderApp(
  options: { initialUrl?: string; now?: Clock } = {}
): Promise<RenderRouterResult> {
  return renderRouter(appRoutes(), {
    initialUrl: options.initialUrl ?? "/",
    wrapper: createClockWrapper(toGetNow(options.now)),
  });
}

/** /settings를 열고 하이드레이션(LoadingGate)이 끝난 설정 화면 컨테이너와 범위 질의를 돌려준다 */
export async function openSettings() {
  const app = await renderApp({ initialUrl: "/settings" });
  const container = await screen.findByTestId("screen-settings");
  return { app, container, settings: within(container) };
}

/**
 * 네이티브 뷰가 붙고 배치를 마친 시점(onLayout)을 흉내 낸다. 테스트 렌더러는 onLayout을 스스로 부르지 않으므로
 * "네이티브 뷰가 생긴 뒤에만 할 수 있는 일"(화면 낭독기 포커스 이동, V-01)은 이 호출로 시점을 연다.
 */
export async function fireLayout(element: HostElement): Promise<void> {
  await fireEvent(element, "layout", {
    nativeEvent: { layout: { x: 0, y: 0, width: 320, height: 48 } },
  });
}

/** 프리셋의 View·Text mock은 props를 가진 클래스 인스턴스다. 포커스 대상(sendAccessibilityEvent 인자, focus의 this)을 props로 가린다 */
export function hostWithProps(props: Readonly<Record<string, unknown>>) {
  return expect.objectContaining({ props: expect.objectContaining(props) });
}

/**
 * 프리셋 mock 호스트(View·Text)의 인스턴스 메서드 focus는 모든 인스턴스가 공유하는 jest.fn이다.
 * 빈 View를 하나 렌더해 그 함수를 얻고 기록을 비운다. 어느 요소에 포커스를 줬는지는 mock.contexts(this)로 본다.
 */
export async function sharedHostFocus() {
  const probe = createRef<HostInstance>();
  await render(<View ref={probe} />);
  if (probe.current === null) throw new Error("probe View가 렌더되지 않았다");
  const focus = jest.mocked(probe.current.focus);
  focus.mockClear();
  return focus;
}
