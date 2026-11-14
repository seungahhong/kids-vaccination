import { useRouter } from "expo-router";
import { ArrowRight, Syringe } from "lucide-react-native";
import { type ReactElement, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Screen } from "@/components/common/Screen";
import { BirthdatePicker } from "@/components/home/BirthdatePicker";
import { ExistingBirthdateShortcut } from "@/components/home/ExistingBirthdateShortcut";
import { useBirthdate } from "@/contexts/BirthdateContext";
import { useI18n } from "@/contexts/I18nContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useToday } from "@/hooks/useToday";
import {
  getBirthdateRange,
  isoDateToDate,
  isWithinRange,
  toIsoDate,
} from "@/lib/date";
import { FONT_SIZE, RADIUS, SPACING } from "@/theme/tokens";
import type { DateRange, IsoDate } from "@/types";

// 홈(FR-01·FR-02, 설계서 §5.9): 제목/부제 → 생년월일 피커(플랫폼별 BirthdatePicker) → 제출.
// 허용 범위는 useToday() 기준 getBirthdateRange(U-05)이고, 제출은 초안이 범위 안일 때만 활성이다.
// 저장은 BirthdateContext setter만 쓴다(화면은 AsyncStorage를 직접 만지지 않는다, 설계서 §2.1 규칙 4).
// 본문은 스크롤한다: 짧은 화면(가로 모드·200% 확대)이나 큰 글꼴에서도 제출 버튼까지 닿아야 한다(리뷰 R1-02).
export default function HomeScreen(): ReactElement {
  const { t } = useI18n();
  const { tokens } = useTheme();
  const { birthdate, setBirthdate } = useBirthdate();
  const router = useRouter();
  // 의존성은 Date identity가 아니라 날짜 문자열(설계서 §5.6·§5.9)
  const todayKey = toIsoDate(useToday());
  const range = useMemo(
    () => getBirthdateRange(isoDateToDate(todayKey)),
    [todayKey]
  );

  const goToSchedule = () => router.navigate("/schedule");
  const handleSubmit = (next: IsoDate) => {
    setBirthdate(next);
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
      {birthdate !== null && (
        <ExistingBirthdateShortcut
          birthdate={birthdate}
          onPress={goToSchedule}
        />
      )}
      {/* 저장값이 바뀌면(설정에서 삭제 등) remount해 초안을 다시 프리필한다(파생 state effect 대신 key) */}
      <HomeForm
        key={birthdate ?? "none"}
        initialValue={birthdate}
        range={range}
        onSubmit={handleSubmit}
      />
    </Screen>
  );
}

function HomeForm({
  initialValue,
  range,
  onSubmit,
}: {
  /** 저장된 생년월일(프리필, AC-1.5). 없으면 null */
  readonly initialValue: IsoDate | null;
  readonly range: DateRange;
  readonly onSubmit: (next: IsoDate) => void;
}): ReactElement {
  const { t } = useI18n();
  const { tokens } = useTheme();
  const [draft, setDraft] = useState<IsoDate | null>(initialValue);
  const canSubmit =
    draft !== null && isWithinRange(isoDateToDate(draft), range);

  return (
    <View style={styles.form}>
      <BirthdatePicker value={draft} onChange={setDraft} range={range} />
      <Pressable
        testID="birthdate-submit"
        role="button"
        disabled={!canSubmit}
        onPress={() => {
          if (canSubmit) onSubmit(draft);
        }}
        style={[
          styles.submit,
          { backgroundColor: tokens.primary, opacity: canSubmit ? 1 : 0.4 },
        ]}
      >
        <Text style={[styles.submitText, { color: tokens.onPrimary }]}>
          {t("home.submit")}
        </Text>
        <ArrowRight color={tokens.onPrimary} size={18} />
      </Pressable>
    </View>
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
  form: { gap: SPACING.md, marginTop: SPACING.sm },
  submit: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.sm,
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACING.lg,
  },
  submitText: { fontSize: FONT_SIZE.md, fontWeight: "600" },
});
