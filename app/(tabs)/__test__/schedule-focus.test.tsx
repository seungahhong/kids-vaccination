import { fireEvent, screen, within } from "@testing-library/react-native";
import { AccessibilityInfo, Platform } from "react-native";

import { STORAGE_KEYS } from "@/lib/storage";

import {
  fireLayout,
  hostWithProps,
  renderApp,
  seedStorage,
  sharedHostFocus,
} from "../../../test-utils/render";

// U-22·V-01: 체크한 카드가 목록에 혼자면 포커스 대상이 그 카드 자신이다. 그 카드는 완료 구역에서 새로 마운트되므로
// 네이티브는 커밋 직후(effect)가 아니라 새 체크박스의 onLayout에서 화면 낭독기 포커스를 옮겨야 한다(V-01과 같은 시점 규칙).
// 실제 데이터로는 보이는 카드가 하나뿐인 경우가 없어서, 이 파일만 접종 데이터를 RSV 항체주사 1회차 하나로 줄인다.
// 생년월일 2026-10-18(오늘)이면 nirsevimab-1은 곧 접종이다.
jest.mock("@/lib/vaccinationData", () => {
  const actual = jest.requireActual<typeof import("@/lib/vaccinationData")>(
    "@/lib/vaccinationData"
  );
  return {
    ...actual,
    VACCINATIONS: actual.VACCINATIONS.filter(
      (vaccination) => vaccination.id === "nirsevimab"
    ),
  };
});

const NIRSEVIMAB_CHECKBOX_KO = "RSV 항체주사(니르세비맙) 1차: 접종 완료";

async function openSingleCardSchedule() {
  await seedStorage({ [STORAGE_KEYS.birthdate]: "2026-10-18" });
  await renderApp({ initialUrl: "/schedule" });
  return within(await screen.findByTestId("screen-schedule"));
}

describe("U-22 혼자인 카드의 체크 뒤 포커스(새로 마운트된 체크박스)", () => {
  it.each(["ios", "android"] as const)(
    "U-22 %s에서 하나뿐인 nirsevimab-1을 체크하면 완료 구역의 새 체크박스가 배치될 때(onLayout) 그리로 화면 낭독기 포커스를 1번 옮긴다",
    async (os) => {
      const schedule = await openSingleCardSchedule();
      const sendEvent = jest.mocked(AccessibilityInfo.sendAccessibilityEvent);
      sendEvent.mockClear();
      const replaced = jest.replaceProperty(Platform, "OS", os);
      const before = schedule.getByTestId("complete-checkbox");

      await fireEvent.press(before);

      // 커밋 직후에는 아직 옮기지 않는다(새 네이티브 뷰가 없다)
      expect(sendEvent).not.toHaveBeenCalled();
      const after = schedule.getByRole("checkbox", {
        name: NIRSEVIMAB_CHECKBOX_KO,
        checked: true,
      });
      expect(after).not.toBe(before);
      expect(schedule.getAllByRole("checkbox")).toHaveLength(1);

      await fireLayout(after);
      await fireLayout(after);

      expect(sendEvent).toHaveBeenCalledTimes(1);
      expect(sendEvent).toHaveBeenCalledWith(
        hostWithProps({ accessibilityLabel: NIRSEVIMAB_CHECKBOX_KO }),
        "focus"
      );
      replaced.restore();
    }
  );

  it("U-22 웹에서는 새 체크박스가 커밋과 함께 DOM에 붙으므로 커밋 직후 그 체크박스에 focus()를 주고, onLayout은 무시한다", async () => {
    const focus = await sharedHostFocus();
    const schedule = await openSingleCardSchedule();
    const replaced = jest.replaceProperty(Platform, "OS", "web");
    focus.mockClear();

    await fireEvent.press(schedule.getByTestId("complete-checkbox"));

    expect(focus).toHaveBeenCalledTimes(1);
    expect(focus.mock.contexts[0]).toEqual(
      hostWithProps({ accessibilityLabel: NIRSEVIMAB_CHECKBOX_KO })
    );
    await fireLayout(schedule.getByTestId("complete-checkbox"));
    expect(focus).toHaveBeenCalledTimes(1);
    replaced.restore();
  });
});
