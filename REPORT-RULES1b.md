# RULES-1b 완료 보고서

브리프의 5건 수정 완료. 2026-10-29 최종 검증에서 `npm test` 22개 파일 / 282개 테스트와 `npm run build`(TypeScript 검사 포함)가 통과했다.

## 수정 내용과 파일

1. `src/net/protocol.ts`, `src/net/host.ts`, `src/net/match-ui.ts`, `src/net/view.ts`
   - 방장이 store 상태에 `armAllowed()`를 적용해 match 메시지에 boolean으로 보낸다.
   - decode는 선택 필드의 boolean 타입을 검증한다. 학생 ARM 버튼과 Space는 명시적인 false일 때만 경기 잠금을 적용한다.
   - 시작 전 자유 연습은 ARM을 허용하고 중앙 안내에도 자유 연습으로 표시한다. 값이 없는 구버전 방장도 학생 쪽에서는 경기 잠금을 적용하지 않는다. 기존 방장 측 ARM 안전 검사는 유지했다.
2. `src/net/host.ts`, `src/net/view.ts`, `src/net/match-ui.ts`
   - HostSession이 모든 최근 call 최대 5개와 `receivedAt`(performance.now 기준 밀리초)을 공개하고 각 call 추가 후 changed()를 알린다.
   - 방장 알림은 이 목록을 구독한다. store 기록에서 call을 다시 만드는 코드를 제거했다. 같은 call 객체는 한 번만 큐에 넣고, 서로 다른 실제 판정은 문구가 같아도 각각 표시한다.
   - 테두리·비스트라이커·역방향 무효 판정도 표시하며 역방향 문구는 「역방향 통과는 점수가 없어요」로 변경했다.
3. `src/net/client.ts`, `src/net/view.ts`
   - `lastDisarmReason`을 보관하고 `{type:'forcedDisarm', reason}` 사건으로 전달한다.
   - 학생 알림: ready 「준비 시간이에요 · 출발 자리에서 기다려요」 / paused 「선생님이 경기를 잠깐 멈췄어요」 / maintenance 「정비 시간이에요」.
4. `src/rules/practice.ts`
   - 골대별 비접촉 스텝을 세고, 접촉이 연속 60스텝(120Hz에서 0.5초) 끊긴 경우에만 다음 접촉을 새 횟수로 센다. 접촉 시 간격을 초기화한다.
5. `src/net/view.ts`
   - 경기 ARM 잠금 시 Space를 눌러도 오류 message에 잠금 이유를 넣지 않는다. ARM 아래 안내와 중앙 단계 안내는 유지한다. 연결 오류·방 종료·거절의 기존 오류 표시는 유지한다.

## 검증

- `src/rules/practice.test.ts` 추가: 19회 짧게 떨어지며 긁기 = 1회, 0.6초 떨어졌다 재접촉 = 2회, 59/60스텝 경계 확인.
- `src/rules/rules.test.ts`: 기존 연습 테스트를 새 재접촉 간격 계약에 맞췄다.
- `src/net/net.test.ts`: 선택 boolean decode, 방장의 단계별 ARM 허용 값, 강제 DISARM 사유 저장·사건 전달, 실제 물리 이동으로 발생한 무효 판정 7건의 호스트 알림 및 최근 5개 보관 확인. 메모리 transport는 encode/decode를 거친다.
- `src/net/view.test.ts`: 자유 연습·구버전 ARM 버튼/Space 허용, 준비 중 잠금과 오류 띠 비표시, 강제 해제 3가지 문구, 방장 무효 판정 3종과 반복 상태 갱신 시 중복 방지 확인.
- `src/net/match-ui.test.ts`: 호스트 허용 값에 따른 잠금과 한국어 판정 문구 확인.
- `._*` 파일 삭제 후 최종 `npm test`: **22개 파일, 282개 테스트 통과**.
- 최종 `npm run build`: **통과**, tsc --noEmit 포함. 별도 lint/static-analysis 스크립트는 없으며 정적 검사는 TypeScript로 수행했다.

## 유지·단순화 및 남은 제한

- store 기록을 역으로 해석하던 방장 알림 경로를 삭제하고 실제 call 경로로 통일했다. 기존 알림 큐와 중복 방지 방식을 재사용했다.
- 판정 엔진·물리·안전 규칙과 `__DRONE_QA` 읽기 전용 인터페이스는 변경하지 않았다. 새 패키지 설치와 git 명령은 사용하지 않았다.
- 실제 Chrome/WebRTC 다중 창 경기, CSS 렌더링 및 실기기 검증은 이번 작업에서 수행하지 않았다. UI 검증은 DOM double, 통신 검증은 메모리 transport 기반이다.
- 기존 500kB 초과 번들 경고는 남아 있다(JS 761.17kB, gzip 203.51kB). 빌드는 성공했다.
DONE
