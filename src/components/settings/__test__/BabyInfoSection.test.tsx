import { fireEvent, screen } from "@testing-library/react-native";
import { type ReactElement, useState } from "react";
import { AccessibilityInfo, Platform } from "react-native";

import { BabyInfoSection } from "@/components/settings/BabyInfoSection";
import { toIsoDate } from "@/lib/date";
import type { IsoDate } from "@/types";

import {
  day,
  fireLayout,
  hostWithProps,
  renderWithProviders,
} from "../../../../test-utils/render";

// 리뷰 라운드 2 회귀 테스트. 제목은 리뷰 ID(R2-xx)로 시작한다(AC 집계 ^AC-와 섞이지 않음).
// R2-06(WCAG 4.1.3 상태 메시지): "확인"으로 삭제하면 포커스는 "생년월일 삭제"로 돌아오지만(R1-03) 결과("생년월일: -")를 알리는
// 수단이 없었다. 값 표시(settings-birthdate)를 polite 라이브 영역으로 두어 바뀐 내용이 화면 낭독기에 알려지게 한다.
// RN 0.88 Text는 aria-live를 네이티브 accessibilityLiveRegion으로 바꾸지 않으므로(View만 바꿈) Text에는 accessibilityLiveRegion을
// 준다. react-native-web은 이것을 DOM aria-live="polite"로 출력한다(e2e/review-r2-a11y.spec.ts가 DOM 속성을 본다).

/** 설정 화면처럼 생년월일 state를 들고 확인(onReset)이면 지우는 부모 */
function BabyInfoHarness({
  initial,
}: {
  readonly initial: IsoDate | null;
}): ReactElement {
  const [birthdate, setBirthdate] = useState<IsoDate | null>(initial);
  return (
    <BabyInfoSection birthdate={birthdate} onReset={() => setBirthdate(null)} />
  );
}

describe("R2-06 생년월일 삭제 결과 고지(라이브 영역)", () => {
  it("R2-06 생년월일 표시(settings-birthdate)는 polite 라이브 영역(accessibilityLiveRegion)이고, '생년월일 삭제' → '확인'으로 지우면 같은 요소의 내용이 '생년월일: -'로 바뀌며 영역은 그대로 남는다", async () => {
    await renderWithProviders(
      <BabyInfoHarness initial={toIsoDate(day("2024-01-31"))} />
    );
    const value = await screen.findByTestId("settings-birthdate");
    expect(value).toHaveTextContent("생년월일: 2024-01-31");
    expect(value).toHaveProp("accessibilityLiveRegion", "polite");

    await fireEvent.press(
      screen.getByRole("button", { name: "생년월일 삭제" })
    );
    await fireEvent.press(screen.getByRole("button", { name: "확인" }));

    // 라이브 영역은 다시 만들지 않고 같은 요소의 내용만 바뀐다(새 요소의 첫 내용은 알려지지 않는다)
    expect(screen.getByTestId("settings-birthdate")).toBe(value);
    expect(value).toHaveTextContent("생년월일: -");
    expect(value).toHaveProp("accessibilityLiveRegion", "polite");
  });
});

/** 고지·포커스 이벤트 mock의 호출 기록을 비우고 돌려준다.
 * 프리셋의 AccessibilityInfo 함수는 spy가 아닌 jest.fn이라 restoreAllMocks가 호출 기록을 지우지 않으므로 테스트마다 비운다. */
function clearedAccessibilityMocks() {
  const announceWithOptions = jest.mocked(
    AccessibilityInfo.announceForAccessibilityWithOptions
  );
  const announce = jest.mocked(AccessibilityInfo.announceForAccessibility);
  const sendEvent = jest.mocked(AccessibilityInfo.sendAccessibilityEvent);
  for (const fn of [announceWithOptions, announce, sendEvent]) fn.mockClear();
  return { announceWithOptions, announce, sendEvent };
}

// R2-06의 iOS 잔여(리뷰 라운드 3에서 partial): RN의 accessibilityLiveRegion은 Android 전용이고 iOS에는 라이브 영역이 없다.
// 그래서 iOS에서만 '확인' 직후 화면에 보이는 결과 문구를 화면 낭독기 고지(announceForAccessibilityWithOptions)로 보낸다.
// queue: true는 바로 앞에서 reset-button으로 옮긴 VoiceOver 포커스(R1-03, sendAccessibilityEvent 'focus') 낭독 뒤에 이어 읽게 한다.
// 포커스는 reset-button이 배치된 뒤(onLayout)에 옮기므로(V-01) 고지도 그 뒤에 이어 보낸다.
// Android·웹은 라이브 영역이 같은 결과를 알리므로 부르지 않는다(중복 고지 방지). 플랫폼은 고지 시점에 읽으므로 첫 렌더 뒤에
// jest.replaceProperty로 바꾸고(R1-03 웹 분기 테스트와 같은 방식) 끝에 원복한다(afterEach restoreAllMocks도 원복한다).
describe("R2-06 iOS 삭제 결과 고지(화면 낭독기 announce)", () => {
  it("R2-06 iOS(Platform.OS 'ios')에서는 '확인'으로 지운 뒤 reset-button이 배치되면 포커스를 옮기고 이어서 화면에 보이는 결과 문구('생년월일: -')를 announceForAccessibilityWithOptions(queue)로 1회 알리며, 확인 단계를 열거나 취소할 때는 알리지 않는다", async () => {
    const { announceWithOptions, announce, sendEvent } =
      clearedAccessibilityMocks();
    await renderWithProviders(
      <BabyInfoHarness initial={toIsoDate(day("2024-01-31"))} />
    );
    const value = await screen.findByTestId("settings-birthdate");
    const os = jest.replaceProperty(Platform, "OS", "ios");

    await fireEvent.press(
      screen.getByRole("button", { name: "생년월일 삭제" })
    );
    await fireEvent.press(screen.getByRole("button", { name: "취소" }));
    await fireLayout(screen.getByTestId("reset-button"));
    await fireEvent.press(
      screen.getByRole("button", { name: "생년월일 삭제" })
    );
    expect(announceWithOptions).not.toHaveBeenCalled();
    sendEvent.mockClear();

    await fireEvent.press(screen.getByRole("button", { name: "확인" }));

    expect(value).toHaveTextContent(/^생년월일: -$/);
    // reset-button이 아직 배치되지 않았으면 포커스도 고지도 미룬다(V-01)
    expect(sendEvent).not.toHaveBeenCalled();
    expect(announceWithOptions).not.toHaveBeenCalled();

    await fireLayout(screen.getByTestId("reset-button"));

    expect(announceWithOptions).toHaveBeenCalledTimes(1);
    expect(announceWithOptions).toHaveBeenCalledWith("생년월일: -", {
      queue: true,
    });
    expect(announce).not.toHaveBeenCalled();
    // 순서: reset-button으로 화면 낭독기 포커스를 옮긴(R1-03) 다음에 결과를 알린다
    expect(sendEvent).toHaveBeenCalledTimes(1);
    expect(sendEvent.mock.invocationCallOrder[0]).toBeLessThan(
      announceWithOptions.mock.invocationCallOrder[0] ?? 0
    );

    // 고지는 그 삭제에 1회뿐이다: 다시 열고 '취소'해 reset-button으로 돌아와도 지난 결과를 다시 알리지 않는다
    await fireEvent.press(
      screen.getByRole("button", { name: "생년월일 삭제" })
    );
    await fireEvent.press(screen.getByRole("button", { name: "취소" }));
    await fireLayout(screen.getByTestId("reset-button"));
    expect(sendEvent).toHaveBeenCalledTimes(2);
    expect(announceWithOptions).toHaveBeenCalledTimes(1);
    os.restore();
    expect(Platform.OS).toBe("ios");
  });

  it.each(["android", "web"] as const)(
    "R2-06 %s에서는 값 표시의 라이브 영역(Android accessibilityLiveRegion·웹 aria-live)이 결과를 알리므로 '확인'으로 지워도 announceForAccessibility 계열을 부르지 않는다(중복 고지 방지)",
    async (os) => {
      const { announceWithOptions, announce } = clearedAccessibilityMocks();
      await renderWithProviders(
        <BabyInfoHarness initial={toIsoDate(day("2024-01-31"))} />
      );
      const value = await screen.findByTestId("settings-birthdate");
      const replaced = jest.replaceProperty(Platform, "OS", os);

      await fireEvent.press(
        screen.getByRole("button", { name: "생년월일 삭제" })
      );
      await fireEvent.press(screen.getByRole("button", { name: "확인" }));
      await fireLayout(screen.getByTestId("reset-button"));

      expect(value).toHaveTextContent(/^생년월일: -$/);
      expect(value).toHaveProp("accessibilityLiveRegion", "polite");
      expect(announceWithOptions).not.toHaveBeenCalled();
      expect(announce).not.toHaveBeenCalled();
      replaced.restore();
      expect(Platform.OS).toBe("ios");
    }
  );
});

// V-01(Android 에뮬레이터 실측): 단계가 바뀔 때 화면 낭독기 포커스를 커밋 직후(effect)에 옮기면, 대상(확인 문구·reset-button)이
// 그 커밋에서 새로 마운트돼 네이티브 뷰가 아직 붙지 않았으므로 이벤트가 버려졌다(RN "Unable to find viewState … for
// sendAccessibilityEvent"). 네이티브는 대상의 onLayout(네이티브 마운트·배치 뒤)에서 마지막으로 요청한 대상에만 1회 옮긴다.
describe("V-01 네이티브 화면 낭독기 포커스는 대상이 배치된 뒤에 옮긴다", () => {
  it.each(["ios", "android"] as const)(
    "V-01 %s에서 확인 문구가 배치되기 전에 '취소'하면 확인 문구로는 옮기지 않고, reset-button이 배치될 때 그리로 1회만 옮긴다(이후 재배치에서는 옮기지 않음)",
    async (os) => {
      const { sendEvent } = clearedAccessibilityMocks();
      await renderWithProviders(
        <BabyInfoHarness initial={toIsoDate(day("2024-01-31"))} />
      );
      await screen.findByTestId("settings-birthdate");
      const replaced = jest.replaceProperty(Platform, "OS", os);

      await fireEvent.press(
        screen.getByRole("button", { name: "생년월일 삭제" })
      );
      await fireEvent.press(screen.getByRole("button", { name: "취소" }));
      expect(sendEvent).not.toHaveBeenCalled();

      const resetButton = screen.getByTestId("reset-button");
      await fireLayout(resetButton);
      await fireLayout(resetButton);

      expect(sendEvent).toHaveBeenCalledTimes(1);
      expect(sendEvent).toHaveBeenCalledWith(
        hostWithProps({ testID: "reset-button" }),
        "focus"
      );
      replaced.restore();
    }
  );
});
