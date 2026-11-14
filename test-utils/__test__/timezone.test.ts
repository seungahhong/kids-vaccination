// 지원 테스트(ENV, PRD G-4 · 설계서 §9.6): jest 워커의 시간대가 실행 스크립트가 지정한 TZ와 같은지 확인한다.
// TZ 없이 `npx jest`로 실행하면 실패하도록 설계했다. `npm test`(Asia/Seoul) 또는 `npm run test:tz:seoul|ny`로 실행한다.
it("ENV TZ process.env.TZ가 지정되어 있고 Intl 시간대가 그 값과 같다", () => {
  const tz = process.env.TZ;
  const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone;
  // 두 TZ 실행 결과에 시간대를 남긴다(G-4 "TZ 확인 테스트가 해당 TZ를 보고함")
  console.log(`ENV TZ process.env.TZ=${tz ?? "(미지정)"} resolved=${resolved}`);

  expect(tz).toEqual(expect.any(String));
  expect(resolved).toBe(tz);
});
