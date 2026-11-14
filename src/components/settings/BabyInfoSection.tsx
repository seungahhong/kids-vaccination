import { Trash2 } from "lucide-react-native";
import {
  type ReactElement,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import {
  AccessibilityInfo,
  type HostInstance,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { useI18n } from "@/contexts/I18nContext";
import { useTheme } from "@/contexts/ThemeContext";
import { FONT_SIZE, MIN_TOUCH_TARGET, RADIUS, SPACING } from "@/theme/tokens";
import type { IsoDate } from "@/types";

// 아기 정보(FR-10, 설계서 §5.8): 저장된 생년월일 표시(settings-birthdate, 없으면 "-")와 인라인 확인을 거치는 삭제.
// reset-button("생년월일 삭제") → 확인 문구(settings.resetConfirm) + reset-confirm / reset-cancel. Alert는 쓰지 않는다(웹 미지원, AC-14.5).
// 확인 단계 state는 컴포넌트 안에 둔다. 색은 CONTRAST_PAIRS 등록 쌍만 쓴다:
// 삭제 버튼 danger on surface(섹션 카드 위, 자체 배경 없음), 확인 상자 dangerText on dangerSurface,
// 확인 onDanger on danger, 취소 chipText on chipBackground.
// 포커스(리뷰 R1-03): 단계가 바뀌면 누른 버튼이 사라지므로 포커스를 옮긴다. 확인 상자는 확인 문구로 이름 붙은 role="group"이다.
// 열면 웹은 확인 상자(tabIndex -1)에 DOM 포커스를 줘 화면 낭독기가 그룹 이름(확인 문구)을 읽고 Tab으로 확인·취소에 닿게 하고,
// 네이티브는 화면 낭독기 포커스를 확인 문구로 옮긴다. 닫으면(취소·확인) 둘 다 reset-button으로 돌려준다.
// 시점(V-01): 대상은 그 커밋에서 새로 마운트된다. 웹은 DOM이 커밋과 함께 붙으므로 커밋 직후(effect)에 옮긴다.
// 네이티브는 커밋 직후에는 아직 네이티브 뷰가 붙지 않아 이벤트가 버려지므로(RN "Unable to find viewState … for
// sendAccessibilityEvent", Android 에뮬레이터 실측) 대상의 onLayout(네이티브 마운트·배치 뒤)에서 옮긴다.
// 결과 고지(리뷰 R2-06, WCAG 4.1.3): 생년월일 표시는 polite 라이브 영역이라 확인으로 지우면 바뀐 내용("생년월일: -")이 알려진다.
// RN 0.88 Text는 aria-live를 네이티브 accessibilityLiveRegion으로 바꾸지 않으므로(View만 바꿈) accessibilityLiveRegion을 쓴다.
// react-native-web은 이것을 DOM aria-live로 출력하고 Android TalkBack은 그대로 읽는다. iOS에는 라이브 영역이 없으므로
// 확인 직후 같은 문구를 화면 낭독기 고지로 보낸다(announceResult, iOS만).

/**
 * 웹은 DOM 포커스(focus()), 네이티브는 화면 낭독기 포커스를 옮긴다. 네이티브 API는 RN 0.88에서 deprecated된
 * AccessibilityInfo.setAccessibilityFocus(reactTag) 대신 그 대체 API인 sendAccessibilityEvent(node, 'focus')다.
 * Platform.OS는 호출 시점에 읽는다(jest replaceProperty로 웹 분기를 검증, 설계서 §7.1).
 */
function moveFocus(node: HostInstance | null): void {
  if (node === null) return;
  if (Platform.OS === "web") node.focus();
  else AccessibilityInfo.sendAccessibilityEvent(node, "focus");
}

/**
 * 삭제 결과를 VoiceOver에 알린다(리뷰 R2-06 iOS). Android(accessibilityLiveRegion)·웹(aria-live)은 값 표시가 바뀌면 스스로
 * 알리므로 부르지 않는다(같은 결과를 두 번 읽지 않게). queue: 바로 앞에서 reset-button으로 옮긴 포커스 낭독을 끊지 않고 뒤에 잇는다.
 * Platform.OS는 호출 시점에 읽는다(jest replaceProperty로 플랫폼 분기를 검증).
 */
function announceResult(message: string): void {
  if (Platform.OS !== "ios") return;
  AccessibilityInfo.announceForAccessibilityWithOptions(message, {
    queue: true,
  });
}

/** 단계가 바뀐 뒤 포커스를 받을 대상: 열면 확인 문구(웹은 확인 상자), 닫으면 reset-button */
type FocusTarget = "question" | "resetButton";

export type BabyInfoSectionProps = {
  readonly birthdate: IsoDate | null;
  /** 확인을 누르면 1회 호출된다(설정 화면은 clearBirthdate만 연결, 설계서 §5.9 D-13) */
  readonly onReset: () => void;
};

export function BabyInfoSection({
  birthdate,
  onReset,
}: BabyInfoSectionProps): ReactElement {
  const { t } = useI18n();
  const { tokens } = useTheme();
  const [confirming, setConfirming] = useState(false);
  const questionId = useId();
  const resetButtonRef = useRef<HostInstance>(null);
  const confirmBoxRef = useRef<HostInstance>(null);
  const questionRef = useRef<HostInstance>(null);
  // 사용자가 단계를 바꿨을 때만 포커스를 옮긴다(첫 렌더에서는 옮기지 않는다). 마지막으로 요청한 대상 하나만 남기고, 옮기면 비운다
  const pendingFocus = useRef<FocusTarget | null>(null);
  // 확인(삭제)으로 닫을 때 알릴 결과 문구. 포커스를 reset-button으로 옮긴 뒤에 보낸다(iOS만, announceResult)
  const pendingResult = useRef<string | null>(null);

  /** 남아 있는 요청이 target이면 포커스를 옮기고, reset-button으로 돌아왔으면 미뤄 둔 결과를 이어서 알린다 */
  const flushFocus = useCallback((target: FocusTarget) => {
    if (pendingFocus.current !== target) return;
    pendingFocus.current = null;
    if (target === "question") {
      moveFocus(
        Platform.OS === "web" ? confirmBoxRef.current : questionRef.current
      );
      return;
    }
    moveFocus(resetButtonRef.current);
    const result = pendingResult.current;
    pendingResult.current = null;
    if (result !== null) announceResult(result);
  }, []);

  useEffect(() => {
    const target = pendingFocus.current;
    if (target !== null && Platform.OS === "web") flushFocus(target);
  }, [confirming, flushFocus]);

  /** 네이티브 대상의 onLayout 핸들러. 웹은 effect가 이미 옮겼으므로 무시한다 */
  const focusAfterLayout = (target: FocusTarget) => () => {
    if (Platform.OS !== "web") flushFocus(target);
  };

  /** 값 표시 문구(settings-birthdate). 삭제 결과 고지도 같은 문구를 쓴다 */
  const birthdateText = (value: IsoDate | null) =>
    `${t("settings.birthdate")}: ${value ?? "-"}`;

  const changeStep = (next: boolean) => {
    pendingFocus.current = next ? "question" : "resetButton";
    setConfirming(next);
  };

  const confirmReset = () => {
    onReset();
    // 삭제 뒤 화면에 보이는 값 표시("생년월일: -")와 같은 문구
    pendingResult.current = birthdateText(null);
    changeStep(false);
  };

  return (
    <View style={styles.container}>
      <Text
        testID="settings-birthdate"
        accessibilityLiveRegion="polite"
        style={[styles.birthdate, { color: tokens.text }]}
      >
        {birthdateText(birthdate)}
      </Text>
      {confirming ? (
        <View
          ref={confirmBoxRef}
          role="group"
          aria-labelledby={questionId}
          tabIndex={-1}
          style={[
            styles.confirmBox,
            {
              backgroundColor: tokens.dangerSurface,
              borderColor: tokens.danger,
            },
          ]}
        >
          <Text
            ref={questionRef}
            nativeID={questionId}
            onLayout={focusAfterLayout("question")}
            style={[styles.confirmText, { color: tokens.dangerText }]}
          >
            {t("settings.resetConfirm")}
          </Text>
          <View style={styles.actions}>
            <Pressable
              testID="reset-confirm"
              role="button"
              onPress={confirmReset}
              style={[styles.action, { backgroundColor: tokens.danger }]}
            >
              <Text style={[styles.actionLabel, { color: tokens.onDanger }]}>
                {t("settings.confirm")}
              </Text>
            </Pressable>
            <Pressable
              testID="reset-cancel"
              role="button"
              onPress={() => changeStep(false)}
              style={[
                styles.action,
                { backgroundColor: tokens.chipBackground },
              ]}
            >
              <Text style={[styles.actionLabel, { color: tokens.chipText }]}>
                {t("settings.cancel")}
              </Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <Pressable
          ref={resetButtonRef}
          testID="reset-button"
          role="button"
          onPress={() => changeStep(true)}
          onLayout={focusAfterLayout("resetButton")}
          style={[styles.resetButton, { borderColor: tokens.danger }]}
        >
          <Trash2 color={tokens.danger} size={16} />
          <Text style={[styles.resetLabel, { color: tokens.danger }]}>
            {t("settings.reset")}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: SPACING.md },
  birthdate: { fontSize: FONT_SIZE.md },
  resetButton: {
    minHeight: MIN_TOUCH_TARGET,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    borderWidth: 1,
    borderRadius: RADIUS.md,
  },
  resetLabel: { fontSize: FONT_SIZE.sm, fontWeight: "600" },
  confirmBox: {
    gap: SPACING.md,
    padding: SPACING.lg,
    borderWidth: 1,
    borderRadius: RADIUS.md,
  },
  confirmText: { fontSize: FONT_SIZE.sm },
  actions: { flexDirection: "row", gap: SPACING.sm },
  action: {
    minHeight: MIN_TOUCH_TARGET,
    minWidth: MIN_TOUCH_TARGET,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: SPACING.lg,
    borderRadius: RADIUS.sm,
  },
  actionLabel: { fontSize: FONT_SIZE.sm, fontWeight: "600" },
});
