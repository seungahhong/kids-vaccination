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

import { moveFocus } from "@/components/common/moveFocus";
import { useChildren } from "@/contexts/ChildrenContext";
import { useI18n } from "@/contexts/I18nContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useEscapeKey } from "@/hooks/useDismiss";
import { formatMessage } from "@/i18n/translate";
import { childBirthdateNote, childLabel, MAX_CHILDREN } from "@/lib/children";
import { FONT_SIZE, MIN_TOUCH_TARGET, RADIUS, SPACING } from "@/theme/tokens";
import type { Child, ChildId } from "@/types";

// 아기 정보: 저장된 아이 목록과 아이별 삭제(FR-10·FR-16, U-28). v1.6까지의 BabyInfoSection(생년월일 하나 + "생년월일 삭제")을 대신한다.
//   settings-children-count: "저장된 아이 N명 (최대 10명)". polite 라이브 영역이라 삭제 결과(줄어든 수)가 화면 낭독기에 알려진다(R2-06과 같은 방식)
//   아이마다 child-row: 이름표(child-row-label, 이름이 있으면 이름, 없으면 생년월일)
//     + (이름이 있으면) "생년월일: YYYY-MM-DD"(child-row-birthdate) + child-delete("삭제", 접근 이름 "{이름표} 삭제")
//     → 누르면 같은 줄이 확인 상자(role="group", 이름 = 확인 문구 "{이름표} 정보를 삭제할까요?") + child-delete-confirm / child-delete-cancel
// 확인을 누르면 그 아이와 완료 기록을 지운다(ChildrenContext.removeChild → 저장소에서도 삭제, 마지막 아이면 키 자체를 지움).
// 포커스(리뷰 R1-03·V-01 규칙): 열면 확인 문구(웹은 확인 상자), 취소하면 그 줄의 삭제 버튼으로 옮긴다. 대상이 새로 마운트되므로
// 웹은 커밋 직후(effect), 네이티브는 대상의 onLayout에서 옮긴다. 확인으로 줄이 사라지면 다음 아이(마지막이면 앞 아이)의 삭제 버튼,
// 아무도 남지 않으면 아이 수 문구로 옮긴다. 이 대상들은 다시 마운트되지 않으므로 웹·네이티브 모두 커밋 직후에 옮긴다.
// 결과 고지: Android(accessibilityLiveRegion)·웹(aria-live)은 아이 수 문구가 바뀌면 스스로 알리고, iOS에는 라이브 영역이 없어
// 같은 문구를 화면 낭독기 고지로 보낸다(announceResult, iOS만). Alert는 쓰지 않는다(웹 미지원, AC-14.5).
// 색은 CONTRAST_PAIRS 등록 쌍만 쓴다: 삭제 버튼 danger on surface, 확인 상자 dangerText on dangerSurface, 확인 onDanger on danger,
// 취소 chipText on chipBackground, 이름표 text on surface, 아이 수·생년월일 textSecondary on surface.

/** 삭제 결과를 VoiceOver에 알린다(iOS만). queue: 바로 앞에서 옮긴 포커스 낭독을 끊지 않고 뒤에 잇는다 */
function announceResult(message: string): void {
  if (Platform.OS !== "ios") return;
  AccessibilityInfo.announceForAccessibilityWithOptions(message, {
    queue: true,
  });
}

/** 줄 안에서 단계가 바뀐 뒤 포커스를 받을 대상: 열면 확인 문구(웹은 확인 상자), 취소하면 삭제 버튼 */
type RowFocusTarget = "question" | "deleteButton";

type ChildRowProps = {
  readonly child: Child;
  /** 확인을 누르면 1회 호출된다 */
  readonly onConfirmDelete: (id: ChildId) => void;
  /** 삭제 버튼 호스트를 등록(마운트)·해제(null)한다. 다른 아이를 지운 뒤 포커스 대상으로 쓴다 */
  readonly registerDeleteButton: (
    id: ChildId,
    node: HostInstance | null
  ) => void;
};

function ChildRow({
  child,
  onConfirmDelete,
  registerDeleteButton,
}: ChildRowProps): ReactElement {
  const { t } = useI18n();
  const { tokens } = useTheme();
  const [confirming, setConfirming] = useState(false);
  const questionId = useId();
  const deleteButtonRef = useRef<HostInstance | null>(null);
  const confirmBoxRef = useRef<HostInstance>(null);
  const questionRef = useRef<HostInstance>(null);
  // 사용자가 단계를 바꿨을 때만 포커스를 옮긴다(첫 렌더에서는 옮기지 않는다)
  const pendingFocus = useRef<RowFocusTarget | null>(null);
  const label = childLabel(child);
  const birthdate = childBirthdateNote(child);
  const { id } = child;

  const setDeleteButton = useCallback(
    (node: HostInstance | null) => {
      deleteButtonRef.current = node;
      registerDeleteButton(id, node);
    },
    [registerDeleteButton, id]
  );

  const flushFocus = useCallback((target: RowFocusTarget) => {
    if (pendingFocus.current !== target) return;
    pendingFocus.current = null;
    if (target === "question") {
      moveFocus(
        Platform.OS === "web" ? confirmBoxRef.current : questionRef.current
      );
      return;
    }
    moveFocus(deleteButtonRef.current);
  }, []);

  useEffect(() => {
    const target = pendingFocus.current;
    if (target !== null && Platform.OS === "web") flushFocus(target);
  }, [confirming, flushFocus]);

  /** 네이티브 대상의 onLayout 핸들러. 웹은 effect가 이미 옮겼으므로 무시한다 */
  const focusAfterLayout = (target: RowFocusTarget) => () => {
    if (Platform.OS !== "web") flushFocus(target);
  };

  const changeStep = (next: boolean) => {
    pendingFocus.current = next ? "question" : "deleteButton";
    setConfirming(next);
  };
  // 웹: 확인 상자 안에서 Escape는 취소와 같다(포커스는 삭제 버튼으로 돌아감, 리뷰 R4-06)
  const escapeProps = useEscapeKey(confirming ? () => changeStep(false) : null);

  return (
    <View
      testID="child-row"
      style={[styles.row, { borderColor: tokens.border }]}
    >
      <Text
        testID="child-row-label"
        numberOfLines={1}
        style={[styles.label, { color: tokens.text }]}
      >
        {label}
      </Text>
      {birthdate === null ? null : (
        <Text
          testID="child-row-birthdate"
          style={[styles.birthdate, { color: tokens.textSecondary }]}
        >
          {`${t("settings.birthdate")}: ${birthdate}`}
        </Text>
      )}
      {confirming ? (
        <View
          ref={confirmBoxRef}
          testID="child-delete-group"
          role="group"
          aria-labelledby={questionId}
          tabIndex={-1}
          {...escapeProps}
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
            testID="child-delete-question"
            nativeID={questionId}
            onLayout={focusAfterLayout("question")}
            style={[styles.confirmText, { color: tokens.dangerText }]}
          >
            {formatMessage(t("settings.deleteChildConfirm"), { name: label })}
          </Text>
          <View style={styles.actions}>
            <Pressable
              testID="child-delete-confirm"
              role="button"
              onPress={() => onConfirmDelete(id)}
              style={[styles.action, { backgroundColor: tokens.danger }]}
            >
              <Text style={[styles.actionLabel, { color: tokens.onDanger }]}>
                {t("settings.confirm")}
              </Text>
            </Pressable>
            <Pressable
              testID="child-delete-cancel"
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
          ref={setDeleteButton}
          testID="child-delete"
          role="button"
          aria-label={formatMessage(t("settings.deleteChild"), { name: label })}
          onPress={() => changeStep(true)}
          onLayout={focusAfterLayout("deleteButton")}
          style={[styles.deleteButton, { borderColor: tokens.danger }]}
        >
          <Trash2 color={tokens.danger} size={16} />
          <Text style={[styles.deleteLabel, { color: tokens.danger }]}>
            {t("settings.delete")}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

export function ChildrenSection(): ReactElement {
  const { t } = useI18n();
  const { tokens } = useTheme();
  const { children, removeChild } = useChildren();
  const deleteButtons = useRef(new Map<ChildId, HostInstance>());
  const countRef = useRef<HostInstance>(null);
  // 아이를 지운 뒤 포커스를 받을 대상(다음·앞 아이의 삭제 버튼 또는 아이 수 문구)과 iOS에 알릴 결과 문구
  const pendingFocus = useRef<ChildId | "count" | null>(null);
  const pendingResult = useRef<string | null>(null);

  const countText = (count: number) =>
    formatMessage(t("settings.childrenCount"), { count, max: MAX_CHILDREN });

  const registerDeleteButton = useCallback(
    (id: ChildId, node: HostInstance | null) => {
      if (node === null) deleteButtons.current.delete(id);
      else deleteButtons.current.set(id, node);
    },
    []
  );

  const confirmDelete = (id: ChildId) => {
    const index = children.findIndex((child) => child.id === id);
    const neighbor = children[index + 1] ?? children[index - 1];
    pendingFocus.current = neighbor === undefined ? "count" : neighbor.id;
    pendingResult.current = countText(children.length - 1);
    removeChild(id);
  };

  useEffect(() => {
    const target = pendingFocus.current;
    if (target === null) return;
    pendingFocus.current = null;
    moveFocus(
      target === "count" ? countRef.current : deleteButtons.current.get(target)
    );
    const result = pendingResult.current;
    pendingResult.current = null;
    if (result !== null) announceResult(result);
  }, [children]);

  return (
    <View style={styles.container}>
      <View
        ref={countRef}
        testID="settings-children-count"
        accessible
        tabIndex={-1}
      >
        <Text
          accessibilityLiveRegion="polite"
          style={[styles.count, { color: tokens.textSecondary }]}
        >
          {countText(children.length)}
        </Text>
      </View>
      {children.map((child) => (
        <ChildRow
          key={child.id}
          child={child}
          onConfirmDelete={confirmDelete}
          registerDeleteButton={registerDeleteButton}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: SPACING.md },
  count: { fontSize: FONT_SIZE.sm },
  row: {
    gap: SPACING.sm,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
  },
  label: { fontSize: FONT_SIZE.md, fontWeight: "600" },
  birthdate: { fontSize: FONT_SIZE.sm },
  deleteButton: {
    minHeight: MIN_TOUCH_TARGET,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    borderWidth: 1,
    borderRadius: RADIUS.md,
  },
  deleteLabel: { fontSize: FONT_SIZE.sm, fontWeight: "600" },
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
