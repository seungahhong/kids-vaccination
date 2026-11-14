import type {
  AndroidNativeProps,
  IOSNativeProps,
} from "@react-native-community/datetimepicker";
import { createElement } from "react";
import { View } from "react-native";

// 수동 mock(U-09: src/mocks/에 두고 jest.setup.ts의 jest.mock이 모든 테스트에 연결, 설계서 §9.3). 모든 props를 host View(testID "datetimepicker-mock")에 노출한다.
// 조작: await fireEvent(picker, "valueChange", { nativeEvent: { timestamp: 0, utcOffset: 0 } }, new Date(2024, 0, 31))
//       await fireEvent(picker, "dismiss")
// props 타입이 라이브러리 타입이라 잘못된 prop은 tsc가 잡는다.
type Props = IOSNativeProps | AndroidNativeProps;

export default function DateTimePicker(props: Props) {
  // 9.x에서 onChange는 deprecated(F-04). 컴포넌트는 onValueChange/onDismiss만 쓴다.
  if ("onChange" in props && props.onChange) {
    throw new Error(
      "DateTimePicker mock: deprecated `onChange` used. Use onValueChange/onDismiss."
    );
  }
  return createElement(View, {
    testID: "datetimepicker-mock",
    ...(props as object),
  });
}
