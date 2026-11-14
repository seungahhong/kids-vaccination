import {
  createContext,
  type ReactElement,
  type ReactNode,
  useContext,
  useMemo,
} from "react";

import { usePersistentState } from "@/hooks/usePersistentState";
import { birthdateCodec, STORAGE_KEYS } from "@/lib/storage";
import type { IsoDate } from "@/types";

// 생년월일 상태(설계서 §5.7, 원본 BirthdateContext 이식). 값은 검증된 IsoDate만 오가고, 저장은 usePersistentState가 맡는다.

export type BirthdateContextValue = {
  readonly birthdate: IsoDate | null;
  readonly setBirthdate: (d: IsoDate) => void;
  readonly clearBirthdate: () => void;
  readonly isReady: boolean;
};

const BirthdateContext = createContext<BirthdateContextValue | null>(null);

export function BirthdateProvider(props: {
  children: ReactNode;
}): ReactElement {
  const { value, isReady, setValue, clearValue } = usePersistentState(
    STORAGE_KEYS.birthdate,
    birthdateCodec
  );

  const contextValue = useMemo<BirthdateContextValue>(
    () => ({
      birthdate: value,
      setBirthdate: setValue,
      clearBirthdate: clearValue,
      isReady,
    }),
    [value, isReady, setValue, clearValue]
  );

  return (
    <BirthdateContext.Provider value={contextValue}>
      {props.children}
    </BirthdateContext.Provider>
  );
}

export function useBirthdate(): BirthdateContextValue {
  const context = useContext(BirthdateContext);
  if (context === null) {
    throw new Error("useBirthdate는 BirthdateProvider 안에서만 쓸 수 있습니다");
  }
  return context;
}
