import { Tabs } from "expo-router/js-tabs";
import {
  Calendar,
  House,
  type LucideIcon,
  Settings,
} from "lucide-react-native";
import type { ReactElement } from "react";

import { useI18n } from "@/contexts/I18nContext";
import { useTheme } from "@/contexts/ThemeContext";
import type { TranslationKey } from "@/i18n/types";

// 하단 탭(FR-11, 설계서 §2.2): SDK 58은 선언되지 않은 화면을 렌더하지 않으므로 Tabs.Screen 3개를 TABS 순서대로 명시한다.
// 헤더는 끄고 제목은 각 화면 본문의 role="heading"이 맡는다(비평 C-16).
// 웹은 role="tab" + aria-selected, 네이티브는 role button + selected 상태로 렌더되고 접근 이름은 tabBarAccessibilityLabel이다(R-10).
// 활성·비활성 라벨 색과 탭 바 배경은 토큰(tabActive/tabInactive on surface, CONTRAST_PAIRS 등록 쌍)이다. 탭 바 높이는 기본값 49(≥ 44).
const TABS = [
  { name: "index", labelKey: "common.home", Icon: House },
  { name: "schedule", labelKey: "common.schedule", Icon: Calendar },
  { name: "settings", labelKey: "common.settings", Icon: Settings },
] as const satisfies readonly {
  name: string;
  labelKey: TranslationKey;
  Icon: LucideIcon;
}[];

export default function TabsLayout(): ReactElement {
  const { t } = useI18n();
  const { tokens } = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: tokens.tabActive,
        tabBarInactiveTintColor: tokens.tabInactive,
        tabBarStyle: {
          backgroundColor: tokens.surface,
          borderTopColor: tokens.border,
        },
      }}
    >
      {TABS.map(({ name, labelKey, Icon }) => (
        <Tabs.Screen
          key={name}
          name={name}
          options={{
            title: t(labelKey),
            tabBarAccessibilityLabel: t(labelKey),
            tabBarIcon: ({ color, size }) => <Icon color={color} size={size} />,
          }}
        />
      ))}
    </Tabs>
  );
}
