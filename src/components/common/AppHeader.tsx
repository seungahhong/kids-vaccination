import { useRouter } from "expo-router";
import { Languages, Moon, Sun, Syringe, UserPlus } from "lucide-react-native";
import {
  type ReactElement,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import {
  type HostInstance,
  type LayoutChangeEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { moveFocus } from "@/components/common/moveFocus";
import { AddChildForm } from "@/components/home/AddChildForm";
import { LanguageSelector } from "@/components/settings/LanguageSelector";
import { useChildren } from "@/contexts/ChildrenContext";
import { useI18n } from "@/contexts/I18nContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useEscapeKey, useFocusLeave } from "@/hooks/useDismiss";
import type { EscapeKeyProps, FocusLeaveProps } from "@/hooks/useDismiss.types";
import { requestTitleFocus } from "@/hooks/useScreenDocument";
import { useToggleKeys } from "@/hooks/useToggleKeys";
import { localeOptionOf } from "@/lib/locale";
import { oppositeTheme } from "@/lib/themePreference";
import { FONT_SIZE, MIN_TOUCH_TARGET, RADIUS, SPACING } from "@/theme/tokens";

// 앱 헤더(FR-15, U-23). 모든 탭 화면(Screen) 맨 위, 스크롤 밖에 고정된다. 설정 화면과 같은 Context 함수로 테마·언어를 바꾸고,
// 아이가 한 명 이상이면 아이 추가도 여기서 한다(FR-16 U-30. 아이가 없을 때는 홈 화면에 추가 폼이 있다).
//   app-header(surface 배경 + 아래 border, SafeArea top 패딩은 여기서 준다)
//   └─ 줄: 주사기 아이콘 + 앱 이름(common.appName, heading 아님 — 화면 제목 h1은 각 화면이 둔다)
//          · header-add-child-button(아이가 있을 때만): role="button", aria-expanded, 이름 home.addChild("아이 추가"). 아이콘 사람+
//          · header-theme-toggle: role="switch", aria-checked = 다크, 이름 settings.darkMode. 아이콘은 라이트면 달, 다크면 해
//          · header-language-button: role="button", aria-expanded, 이름 "{settings.language}: {현재 언어 자국어명}". 아이콘 문A
// 메뉴(한 번에 하나): 헤더 바로 아래부터 화면 끝까지 본문 위에 덮이는 층(U-25: 헤더 높이·본문 위치가 바뀌지 않음)
//   header-{language|add}-overlay
//   ├─ header-{language|add}-backdrop: 투명 Pressable. 메뉴 밖을 누르면 닫는다. 보조기기·Tab에서는 숨긴다(aria-hidden, 네이티브
//   │   focusable false, 웹 tabIndex -1 — RNW Pressable은 focusable false를 tabindex로 옮기지 않아 Tab이 덮개에 먼저 멈췄다)
//   └─ header-language-panel: 오른쪽 위 메뉴 상자(role region, 이름 settings.language) 안의 LanguageSelector(radiogroup, header-locale-option-*)
//      header-add-panel: 헤더 폭의 메뉴 상자(role region, 이름 = 폼 제목 "아이 추가") 안의 AddChildForm(header-add-child)
//      메뉴 상자는 헤더(banner)·본문(main) 밖의 형제 층이라 이름 붙은 region 랜드마크로 둔다(리뷰 R4-05, axe region 규칙)
// 덮개 층은 헤더 안이 아니라 헤더의 형제(Screen 프레임의 자식)다. 헤더 안에 두고 헤더 밖으로 내보내면 Android가 부모 영역 밖 터치를
// 받지 않기 때문이다. 그래서 헤더 높이를 onLayout으로 재서 층의 top으로 쓰고, zIndex로 본문(ScrollView)보다 위에 그린다.
// 층은 DOM·접근성 순서상 헤더 바로 뒤다. 언어 메뉴는 언어 버튼(줄의 마지막 버튼) 바로 뒤라 disclosure로 둔다(포커스를 옮기지 않음).
// 아이 추가 메뉴는 추가 버튼 뒤에 테마·언어 버튼이 있어 바로 뒤가 아니므로, 열면 포커스를 메뉴로 옮긴다: 웹은 메뉴 상자(tabIndex -1)에
// 커밋 직후, 네이티브는 폼 제목이 배치된 뒤(onLayout, V-01)다. 아이를 더하면 메뉴를 닫고 그 아이의 일정 화면으로 간다.
// 항목을 누르거나(언어) 메뉴 밖을 누르면 닫고 포커스를 연 버튼으로 돌려준다. 버튼은 다시 마운트되지 않으므로 커밋 직후에 옮긴다.
// 언어 메뉴의 방향키·Space는 고르기만 하고 닫지 않는다. 웹 스위치 Space는 useToggleKeys가 맡는다(RNW Pressable은 Space를 button에서만
// 처리). 터치 영역은 모두 44×44 이상이다.
// 색: 앱 이름 text on surface, 아이콘은 textSecondary(펼친 메뉴 버튼은 onPrimarySoft on primarySoft), 주사기는 tabActive,
// 메뉴 그림자는 shadow 토큰(웹은 RNW가 box-shadow로, Android는 elevation)이다.
// 웹 키보드(리뷰 R4): 헤더는 banner 랜드마크다. 메뉴가 열려 있으면 헤더 줄이나 메뉴 안에서 Escape로 닫고 연 버튼으로 포커스를 돌려준다(R4-01).
// 포커스가 메뉴 층 밖으로 나가면(메뉴 뒤 Tab, Shift+Tab) 메뉴를 닫는다. 메뉴는 본문을 가리므로 열어 둔 채 본문으로 포커스가 가면
// 포커스가 메뉴 아래에 가려져 보이지 않는다(R4-02, WCAG 2.4.7). 그 메뉴를 연 버튼으로 돌아가는 이동만은 닫지 않는다(다시 누르면 닫힘).

type HeaderMenu = "language" | "add";

/** 헤더 아래를 덮는 메뉴 층: 투명 덮개(밖을 누르면 닫힘) + 메뉴 상자 */
function HeaderOverlay({
  menu,
  top,
  onDismiss,
  dismissProps,
  children,
}: {
  readonly menu: HeaderMenu;
  readonly top: number;
  readonly onDismiss: () => void;
  /** 웹 Escape·포커스 이탈 닫기(useDismiss, 리뷰 R4-01·R4-02). 네이티브는 빈 객체 */
  readonly dismissProps: EscapeKeyProps & FocusLeaveProps;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <View
      testID={`header-${menu}-overlay`}
      {...dismissProps}
      style={[styles.overlay, { top }]}
    >
      <Pressable
        testID={`header-${menu}-backdrop`}
        aria-hidden
        focusable={false}
        tabIndex={-1}
        onPress={onDismiss}
        style={StyleSheet.absoluteFill}
      />
      {children}
    </View>
  );
}

export function AppHeader(): ReactElement {
  const { t, locale, setLocale } = useI18n();
  const { tokens, preference, setPreference } = useTheme();
  const { children } = useChildren();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [menu, setMenu] = useState<HeaderMenu | null>(null);
  // 헤더(SafeArea top 포함) 높이. 덮개 층이 헤더 바로 아래에서 시작한다
  const [headerHeight, setHeaderHeight] = useState(0);
  const languageButtonRef = useRef<HostInstance>(null);
  const addButtonRef = useRef<HostInstance>(null);
  const addPanelRef = useRef<HostInstance>(null);
  const addHeadingRef = useRef<HostInstance>(null);
  const addHeadingId = useId();
  // 메뉴를 닫은 뒤 포커스를 돌려줄 버튼(항목·덮개로 닫았을 때만. 버튼으로 닫으면 포커스가 이미 버튼에 있다)
  const returnFocus = useRef<HeaderMenu | null>(null);
  // 아이 추가 메뉴를 연 직후 메뉴 안으로 포커스를 옮길지
  const focusAddPanel = useRef(false);
  const dark = preference === "dark";
  const canOpenAdd = children.length > 0;

  const toggleTheme = useCallback(
    () => setPreference(oppositeTheme(preference)),
    [preference, setPreference]
  );
  const themeKeys = useToggleKeys(toggleTheme);

  const toggleMenu = (next: HeaderMenu) => {
    const opening = menu !== next;
    focusAddPanel.current = opening && next === "add";
    setMenu(opening ? next : null);
  };

  /** 항목을 고르거나 메뉴 밖을 눌러 닫고, 연 버튼으로 포커스를 돌려준다 */
  const dismissMenu = useCallback(() => {
    setMenu((open) => {
      returnFocus.current = open;
      return null;
    });
  }, []);

  /** 포커스가 메뉴 층 밖으로 나갔다: 그 메뉴를 연 버튼으로 간 것이 아니면 닫는다(포커스는 사용자가 옮긴 곳에 그대로 둔다) */
  const leaveMenu = useCallback((next: unknown) => {
    setMenu((open) => {
      const trigger =
        open === "add" ? addButtonRef.current : languageButtonRef.current;
      return next !== null && next === trigger ? open : null;
    });
  }, []);
  const escapeProps = useEscapeKey(menu === null ? null : dismissMenu);
  const focusLeaveProps = useFocusLeave(leaveMenu);
  const overlayProps = { ...escapeProps, ...focusLeaveProps };

  const handleAdded = () => {
    setMenu(null);
    // 메뉴와 함께 제출 버튼이 사라지므로 일정 화면 제목으로 포커스를 옮기게 요청한다(웹, 리뷰 R4-03)
    requestTitleFocus("screen-schedule");
    router.navigate("/schedule");
  };

  const measureHeader = useCallback((event: LayoutChangeEvent) => {
    setHeaderHeight(event.nativeEvent.layout.height);
  }, []);

  useEffect(() => {
    const target = returnFocus.current;
    if (target !== null) {
      returnFocus.current = null;
      moveFocus(
        target === "add" ? addButtonRef.current : languageButtonRef.current
      );
    }
    // 웹은 메뉴 상자가 커밋과 함께 DOM에 붙으므로 지금 옮긴다(네이티브는 폼 제목 onLayout)
    if (menu === "add" && focusAddPanel.current && Platform.OS === "web") {
      focusAddPanel.current = false;
      moveFocus(addPanelRef.current);
    }
  }, [menu]);

  /** 폼 제목의 네이티브 배치 뒤 화면 낭독기 포커스를 메뉴 안으로 옮긴다(V-01) */
  const focusAddHeading = () => {
    if (!focusAddPanel.current || Platform.OS === "web") return;
    focusAddPanel.current = false;
    moveFocus(addHeadingRef.current);
  };

  const ThemeIcon = dark ? Sun : Moon;
  const iconColor = (open: boolean) =>
    open ? tokens.onPrimarySoft : tokens.textSecondary;
  const buttonStyle = (open: boolean) => [
    styles.iconButton,
    open ? { backgroundColor: tokens.primarySoft } : null,
  ];
  const panelColors = {
    backgroundColor: tokens.surface,
    borderColor: tokens.border,
    shadowColor: tokens.shadow,
  };

  return (
    <>
      <View
        testID="app-header"
        role="banner"
        onLayout={measureHeader}
        {...escapeProps}
        style={[
          styles.header,
          {
            paddingTop: insets.top,
            backgroundColor: tokens.surface,
            borderBottomColor: tokens.border,
          },
        ]}
      >
        <View style={styles.row}>
          <View style={styles.brand}>
            <Syringe color={tokens.tabActive} size={20} />
            <Text
              testID="header-app-name"
              numberOfLines={1}
              style={[styles.appName, { color: tokens.text }]}
            >
              {t("common.appName")}
            </Text>
          </View>
          {canOpenAdd ? (
            <Pressable
              ref={addButtonRef}
              testID="header-add-child-button"
              role="button"
              aria-expanded={menu === "add"}
              aria-label={t("home.addChild")}
              onPress={() => toggleMenu("add")}
              style={buttonStyle(menu === "add")}
            >
              <UserPlus color={iconColor(menu === "add")} size={20} />
            </Pressable>
          ) : null}
          <Pressable
            testID="header-theme-toggle"
            role="switch"
            aria-checked={dark}
            aria-label={t("settings.darkMode")}
            onPress={toggleTheme}
            {...themeKeys}
            style={styles.iconButton}
          >
            <ThemeIcon color={tokens.textSecondary} size={20} />
          </Pressable>
          <Pressable
            ref={languageButtonRef}
            testID="header-language-button"
            role="button"
            aria-expanded={menu === "language"}
            aria-label={`${t("settings.language")}: ${localeOptionOf(locale).nativeName}`}
            onPress={() => toggleMenu("language")}
            style={buttonStyle(menu === "language")}
          >
            <Languages color={iconColor(menu === "language")} size={20} />
          </Pressable>
        </View>
      </View>
      {menu === "language" ? (
        <HeaderOverlay
          menu="language"
          top={headerHeight}
          onDismiss={dismissMenu}
          dismissProps={overlayProps}
        >
          <View
            testID="header-language-panel"
            role="region"
            aria-label={t("settings.language")}
            style={[styles.panel, styles.languagePanel, panelColors]}
          >
            <ScrollView style={styles.panelScroll}>
              <LanguageSelector
                value={locale}
                onChange={setLocale}
                onPick={dismissMenu}
                testIDPrefix="header-locale-option"
              />
            </ScrollView>
          </View>
        </HeaderOverlay>
      ) : null}
      {menu === "add" ? (
        <HeaderOverlay
          menu="add"
          top={headerHeight}
          onDismiss={dismissMenu}
          dismissProps={overlayProps}
        >
          <View
            ref={addPanelRef}
            testID="header-add-panel"
            role="region"
            aria-labelledby={addHeadingId}
            tabIndex={-1}
            style={[styles.panel, styles.addPanel, panelColors]}
          >
            <ScrollView
              style={styles.panelScroll}
              contentContainerStyle={styles.addPanelContent}
              keyboardShouldPersistTaps="handled"
            >
              <AddChildForm
                testID="header-add-child"
                onAdded={handleAdded}
                headingRef={addHeadingRef}
                headingNativeID={addHeadingId}
                onHeadingLayout={focusAddHeading}
              />
            </ScrollView>
          </View>
        </HeaderOverlay>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  header: { borderBottomWidth: 1 },
  row: {
    minHeight: MIN_TOUCH_TARGET + SPACING.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xs,
    paddingLeft: SPACING.lg,
    paddingRight: SPACING.sm,
  },
  brand: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
  },
  appName: { flexShrink: 1, fontSize: FONT_SIZE.sm, fontWeight: "700" },
  iconButton: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: RADIUS.md,
  },
  // 헤더 아래 ~ 화면 끝을 덮는 층. 언어 메뉴 상자는 오른쪽 위(언어 버튼 아래)에 붙고, 아이 추가 메뉴 상자는 폭을 채운다
  overlay: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 10,
    alignItems: "flex-end",
    paddingTop: SPACING.xs,
    paddingRight: SPACING.sm,
    paddingBottom: SPACING.sm,
  },
  // 낮은 화면(예: 320×256)에서도 층(안쪽 여백 제외) 안에 들어오게 메뉴와 그 안의 스크롤이 줄어든다(flexShrink). maxHeight "100%"는
  // 층의 여백을 빼지 않아 메뉴 아래가 탭 바에 잘렸다
  panel: {
    flexShrink: 1,
    padding: SPACING.xs,
    borderWidth: 1,
    borderRadius: RADIUS.lg,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 8,
  },
  languagePanel: { width: 240 },
  addPanel: { alignSelf: "stretch", marginLeft: SPACING.sm },
  addPanelContent: { padding: SPACING.md },
  panelScroll: { flexGrow: 0, flexShrink: 1 },
});
