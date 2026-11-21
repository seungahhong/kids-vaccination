import { useRouter } from "expo-router";
import { Syringe } from "lucide-react-native";
import type { ReactElement } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Screen } from "@/components/common/Screen";
import { AddChildForm } from "@/components/home/AddChildForm";
import { SavedChildren } from "@/components/home/SavedChildren";
import { useChildren } from "@/contexts/ChildrenContext";
import { useI18n } from "@/contexts/I18nContext";
import { useTheme } from "@/contexts/ThemeContext";
import { FONT_SIZE, RADIUS, SPACING } from "@/theme/tokens";
import type { ChildId } from "@/types";

// 홈(FR-01·FR-02·FR-16, 설계서 §5.9): 제목/부제 → (아이가 없으면) 아이 추가 폼 / (있으면) 저장된 아이 목록.
// 아이 추가는 처음에만 홈 화면에서 한다(U-30). 한 명이라도 저장되면 홈에서는 폼을 숨기고 저장된 아이 목록(SavedChildren)만 보이며,
// 더 추가하려면 헤더의 "아이 추가" 버튼(AppHeader)을 쓴다. 폼은 AddChildForm(생년월일 필수 → 이름 선택)이고, 제출하면 그 아이를
// 선택해 일정 화면으로 간다. 목록의 바로가기도 그 아이를 선택하고 일정 화면으로 간다.
// 저장은 ChildrenContext 함수만 쓴다(화면은 AsyncStorage를 직접 만지지 않는다, 설계서 §2.1 규칙 4).
// 본문은 스크롤한다: 짧은 화면(가로 모드·200% 확대)이나 큰 글꼴에서도 제출 버튼까지 닿아야 한다(리뷰 R1-02).
export default function HomeScreen(): ReactElement {
  const { t } = useI18n();
  const { tokens } = useTheme();
  const { children, selectChild } = useChildren();
  const router = useRouter();

  const goToSchedule = () => router.navigate("/schedule");
  const openChild = (id: ChildId) => {
    selectChild(id);
    goToSchedule();
  };

  return (
    <Screen testID="screen-home" scroll>
      <View style={styles.hero}>
        <View
          style={[styles.iconCircle, { backgroundColor: tokens.primarySoft }]}
        >
          <Syringe color={tokens.onPrimarySoft} size={40} />
        </View>
        <Text role="heading" style={[styles.title, { color: tokens.text }]}>
          {t("home.title")}
        </Text>
        <Text style={[styles.subtitle, { color: tokens.textSecondary }]}>
          {t("home.subtitle")}
        </Text>
      </View>
      {children.length === 0 ? (
        <AddChildForm testID="home-add-child" onAdded={goToSchedule} />
      ) : (
        <SavedChildren items={children} onOpen={openChild} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: "center", paddingVertical: SPACING.xl },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: RADIUS.full,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: SPACING.xl,
  },
  title: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: "700",
    textAlign: "center",
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: FONT_SIZE.sm,
    lineHeight: 22,
    textAlign: "center",
    marginTop: SPACING.md,
  },
});
