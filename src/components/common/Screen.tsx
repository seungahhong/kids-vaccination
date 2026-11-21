import {
  type ComponentType,
  type ReactElement,
  type ReactNode,
  type RefAttributes,
  useRef,
} from "react";
import {
  type HostInstance,
  ScrollView,
  StyleSheet,
  View,
  type ViewProps,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppHeader } from "@/components/common/AppHeader";
import { useI18n } from "@/contexts/I18nContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useBlurInert } from "@/hooks/useBlurInert";
import type { BlurInertProps } from "@/hooks/useBlurInert.types";
import { useScreenDocument } from "@/hooks/useScreenDocument";
import type { TranslationKey } from "@/i18n/types";
import { SPACING } from "@/theme/tokens";

// 화면 셸(설계서 §5.8): 최외곽 View에 testID(screen-*)와 배경 토큰, SafeArea left/right 패딩.
// 맨 위에는 앱 헤더(AppHeader, FR-15)가 스크롤 밖에 고정되고, SafeArea top 패딩은 헤더가 준다(상태 표시줄 뒤까지 헤더 배경이 이어지게).
// 하단 inset은 탭 바가 처리한다. 색은 렌더 시 tokens에서 인라인으로 합친다(§7.3).
// 최외곽 View는 useBlurInert의 props도 받는다. 웹에서 하단 탭으로 떠난 화면은 inert라 Tab 순서·보조기기에서 빠지고
// (활성 화면 뒤에 남아 있어도 키보드로 닿지 않음), 네이티브는 아무것도 더하지 않는다(리뷰 R2-01).
// 랜드마크(리뷰 R4-05): 헤더는 banner(AppHeader), 본문(스크롤 영역)은 main이다. 웹에서 <header>·<main>이 되어 화면 낭독기가 본문으로
// 바로 건너뛸 수 있다. 문서 제목·제목 포커스 요청은 useScreenDocument가 맡는다(R4-03, 웹만): 홈은 앱 이름, 다른 화면은 "화면 · 앱 이름".

/**
 * 최외곽 View. RN 0.88 View 타입에는 inert가 없지만 react-native-web View는 inert를 DOM 속성으로 넘긴다.
 * 더 많은 props를 받는 타입으로의 대입이라 tsc가 매개변수 호환성으로 검사한다(단언 없음, LanguagePressable.web.tsx와 같은 방식).
 */
const ScreenFrame: ComponentType<
  ViewProps & BlurInertProps & RefAttributes<HostInstance>
> = View;

export type ScreenTestID =
  "screen-home" | "screen-schedule" | "screen-settings";

/** 화면별 문서 제목의 화면 이름. 홈은 앱 이름만 쓴다(검색 결과에 보이는 첫 화면 제목, e2e/seo.spec.ts) */
const SCREEN_TITLE_KEYS: Readonly<Record<ScreenTestID, TranslationKey | null>> =
  {
    "screen-home": null,
    "screen-schedule": "common.schedule",
    "screen-settings": "common.settings",
  };

export type ScreenProps = {
  readonly testID: ScreenTestID;
  /** true면 본문을 ScrollView에 담는다(홈·일정·설정 화면 모두. 홈은 리뷰 R1-02에서 추가) */
  readonly scroll?: boolean;
  readonly children: ReactNode;
};

export function Screen({
  testID,
  scroll = false,
  children,
}: ScreenProps): ReactElement {
  const { tokens } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const blurInert = useBlurInert();
  const frameRef = useRef<HostInstance>(null);
  const titleKey = SCREEN_TITLE_KEYS[testID];
  useScreenDocument({
    screen: testID,
    frameRef,
    title:
      titleKey === null
        ? t("common.appName")
        : `${t(titleKey)} · ${t("common.appName")}`,
  });
  const frame = {
    backgroundColor: tokens.background,
    paddingLeft: insets.left,
    paddingRight: insets.right,
  };

  return (
    <ScreenFrame
      ref={frameRef}
      testID={testID}
      style={[styles.fill, frame]}
      {...blurInert}
    >
      <AppHeader />
      {scroll ? (
        <ScrollView
          role="main"
          style={styles.fill}
          contentContainerStyle={styles.content}
        >
          {children}
        </ScrollView>
      ) : (
        <View role="main" style={[styles.fill, styles.content]}>
          {children}
        </View>
      )}
    </ScreenFrame>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { padding: SPACING.lg },
});
