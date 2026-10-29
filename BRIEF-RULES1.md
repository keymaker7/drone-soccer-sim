# RULES-1 — 3:3·5:5 진짜 경기: 규칙 엔진(메카닉만) (keymaker 10/29 22:57)

원문: "이제 3:3 또는 5:5가 되게해줘." 지금 「함께 경기」는 같이 날기만 된다. 골대는 그림일 뿐 부딪히지도 않고, 득점·오프사이드·페널티 판정이 없다.
이번 실행은 **메카닉만** 만든다: 상태·사건·명령·테스트. 화면(HUD·알림·버튼)은 다음 브리프(RULES-1-UI)에서 따로 한다.
이번에 화면 코드를 고쳐야 하는 곳은 아래 6번(배선)의 최소한뿐이다. 새 문구·스타일·레이아웃은 만들지 않는다.

## 좌표 약속
- 골대 g ∈ {blue, red}. blue 골대는 x = −goalX(파랑이 지키는 골대), red 골대는 x = +goalX. goalX·높이·반지름·두께는 `layoutFor(arena).goal`(내경 0.30, 외경 0.50, 두께 0.16, 중심 높이 3, z = 0).
- 골대 앞면은 경기장 가운데를 향한다. 골대 기준 깊이 `u = (x − gx) · sign(gx)`: u < 0 앞, u > 0 뒤. `ρ = hypot(y − gy, z − gz)`.
- 파랑은 x < 0 진영을 지키고 red 골대(+x)를 공격한다. 빨강은 반대.
- 드론 반지름 r = `C.radius`(0.20). 「슬랩」 = |u| < d/2 + r (d = 두께).

## 1. 골대 링 충돌 — `src/rules/ring.ts` (순수 함수)
- 링 몸통 = |u| ≤ d/2 이고 ri ≤ ρ ≤ ro 인 고리 기둥. 구(중심 p, 반지름 r)와 고리 기둥의 최근접점: 축 방향은 u를 [−d/2, d/2]로, 반지름 방향은 ρ를 [ri, ro]로 자른 점(ρ < 1e-9면 반지름 방향을 +y로 둔다).
- 거리 < r 이면 그 법선 방향으로 r 만큼 떨어지게 밀어내고, 속도의 법선 성분이 안쪽이면 `C.restitution`으로 반사한다(드론끼리·벽과 같은 방식). 중심이 몸통 안이면 가장 가까운 면으로 빼낸다.
- `ringDistance(p, ring)`·`collideRing(flight, ring)`을 내보낸다. **`flight.ts`의 `collide()` 안에서 두 골대 모두 처리**해서 혼자 비행·함께 경기 둘 다 링에 부딪히게 한다.
- 「테두리 닿음」 판정 = 충돌 처리 뒤 `ringDistance ≤ r + 1e-4`.

## 2. 통과 추적 — `src/rules/passage.ts` (순수, 드론 하나 × 골대 하나)
- 상태: 슬랩 밖 앞 / 밖 뒤 / 슬랩 안(어느 쪽에서 들어왔는지, 테두리 닿았는지, 구멍을 지나 평면을 건넜는지).
- 매 스텝 (이전 위치, 현재 위치)를 받는다. 중심이 골대 평면(u = 0)을 건너면 **두 위치를 선분으로 보간한 교차점**의 ρ를 계산한다. 구멍 통과 = 교차점 ρ + r ≤ ri. 그렇지 않은 평면 건너기는 링에 막힌 것이므로 통과가 아니다.
- 사건(각각 한 번만):
  - `pass-forward`: 앞에서 슬랩에 들어와 구멍으로 평면을 건너고 **뒤로 슬랩을 완전히 빠져나감**(u ≥ d/2 + r). `clean` = 그동안 테두리에 한 번도 안 닿음.
  - `pass-reverse`: 뒤에서 들어와 같은 방식으로 앞으로 완전히 빠져나감. `clean` 포함.
  - `back-entry`: 뒤에서 들어와 몸이 구멍 쪽으로 걸침(ρ < ri 이고 u − r < d/2). 슬랩을 뒤로 완전히 빠져나가기 전까지 다시 내지 않는다.
  - 들어온 쪽으로 되돌아 나가면 아무 사건 없음.
- 120 Hz에서 한 스텝에 0.25 m(30 m/s) 움직여도 놓치지 않아야 한다.

## 3. 심판 — `src/rules/referee.ts` (순수)
`refereeStep(state, drones, match)` → `Call[]`. drones = `{id, team, role, prev, pos}[]`, match = `{active: boolean; offside: Record<Team, boolean>}`.
- `active`가 false면(경기 중이 아님) 통과 추적 상태만 갱신하고 판정은 내지 않는다.
- 상대 골대 `pass-forward`:
  - 스트라이커 + 우리 팀 오프사이드 아님 + clean → `goal` + `offside`(on).
  - 스트라이커 + 오프사이드 중 → `penalty`(reason `offside-pass`), 득점 없음.
  - 스트라이커 + 테두리 닿음 → `no-goal`(reason `rim`) + `offside`(on). 통과는 통과다.
  - 스트라이커가 아니면 → `no-goal`(reason `not-striker`). 오프사이드 없음.
- 상대 골대 `pass-reverse`(스트라이커): 득점 없이 `no-goal`(reason `reverse`) + `offside`(on). 오프사이드 중이면 `penalty`(`offside-pass`).
- 자기 골대 `back-entry`(역할 무관): `penalty`(reason `own-goal-back`).
- 오프사이드 해제: 그 팀이 오프사이드이고 **팀 드론 전원이 자기 진영에 몸 전체가 있을 때**(파랑 x ≤ −r, 빨강 x ≥ r) `offside-clear` 한 번.
- Call = `{kind: 'goal'|'offside'|'offside-clear'|'penalty'|'no-goal'; team; id?; reason?}`.

## 4. 경기 상태와 연결 — `src/score/match.ts` 확장, `src/score/store.ts` 신설
- `MatchEvent`: `offside`에 `on?: boolean`(주면 그 값으로 설정, 이미 같으면 아무것도 안 함·기록 안 남김. 안 주면 지금처럼 토글 — O/P 키 유지). `score`·`penalty`·`offside`에 `by?: string`(기체 이름 `닉네임 · 역할`), `penalty`에 `reason?: string`.
- `MatchRecord`에 `drone?: string`·`auto?: boolean`. 자동 판정은 `auto: true`. CSV에 「기체」 열 추가. 예전 저장본(이 필드 없음)도 그대로 복원된다.
- `store.ts`: `createMatchStore(initial, persist?)` → `{get, dispatch, subscribe}`. main.ts가 하나 만들어 **스코어판 탭과 함께 경기가 같은 store를 쓴다**(= 「스코어판 자동 연결」). `mountScore(container, store)`로 바꾸고 localStorage 저장·복원은 store 쪽으로 옮긴다. 기존 스코어판 동작·단축키는 그대로.
- `armAllowed(snapshot)` (rules 쪽 순수 함수): 경기 중(`playing` + running) / 아직 시작 전(`ready`, 멈춤, 기록 없음 = 자유 연습) / 경기 끝(`finished`)만 true. 준비 카운트다운·일시정지·정비 중은 false.

## 5. 방장 세션 — `src/net/host.ts`
- `HostSession` 옵션에 `match?: MatchStore`. 있으면:
  - 매 물리 스텝 충돌 처리 뒤 `refereeStep` → Call을 store에 dispatch(`now = Date.now()`, `by`·`auto`) → 학생 모두에게 `call` 메시지.
  - 100 ms마다 `tick` dispatch. store가 바뀌면(그리고 1초마다) 학생에게 `match` 메시지.
  - `armAllowed`가 true→false로 바뀌면 `disarmAll()` + 학생에게 `disarm` 메시지(reason). false인 동안 ARM 요청 무시.
  - 준비 카운트다운이 시작될 때와 정비가 시작될 때 전원을 **출발 대형**(지금 hello에서 쓰는 자리, 바닥, 속도·자세 0, 자기 골대 반대쪽을 봄)으로 되돌린다. 위치 계산은 `formationFor(team, role, maxPerTeam, arena)` 하나로 모은다.
- `protocol.ts`(v:1 유지, 새 타입만 추가·검증):
  - `match`: phase, set, running, remaining(ms), teams.blue/red의 name·score·wins·penalties·offside.
  - `call`: kind, team, id?, reason?, nick?.
  - `disarm`: reason.
  - 모두 `decode`에서 엄격히 검사(문자열 길이·열거값·숫자 범위).
- `client.ts`: 최신 `match`(받은 시각 포함 → 시계는 학생 쪽에서 줄여 보임), 최근 `call` 목록(최대 5개), `disarm`을 받으면 내 controls를 끄고 `forcedDisarm` 사건을 알린다. 화면은 다음 브리프에서 쓴다. 이번엔 `net/view.ts`에서 `disarm`을 받으면 `input.armed = false`로 맞추는 한 줄 배선만.

## 6. 배선(최소)
- main.ts: store 생성 → `mountScore(…, store)`·`mountNet(…, {match: store})` → 방장 세션 생성 시 넘김.
- 혼자 비행(fly 탭): 링 충돌은 1번으로 자동. 골대 통과 연습 횟수는 `src/rules/practice.ts`(passage 재사용: 두 골대 중 아무 데나 `pass-forward` clean = 통과 1, 테두리 닿기 시작 = 닿음 1)만 만들고 `__DRONE_QA.state()`에 `practice: {passes, rimTouches}`를 넣는다. 화면 표시는 다음 브리프.

## 7. 테스트 (Vitest, 위 순수 모듈 각각)
1. 가운데로 3 m/s 앞→뒤 직진: pass-forward clean 1회.
2. 중심 ρ 0.09 직진: clean. ρ 0.12: 테두리 닿음(clean false), 튕김이 생겨도 통과는 기록.
3. ρ 0.40(링 몸통)으로 3 m/s 돌진: 뚫지 못함(매 스텝 ringDistance ≥ r − 1e-6), 법선 속도 반사.
4. 30 m/s(스텝당 0.25 m) 통과도 1회로 잡힘.
5. 앞에서 들어와 평면 건넌 뒤 앞으로 되돌아감: 사건 없음.
6. 뒤→앞: pass-reverse.
7. 파랑 스트라이커가 red 골대 앞→뒤 clean: goal + offside. 오프사이드 중이면 penalty만.
8. 파랑 가이드 통과: no-goal not-striker, offside 없음.
9. 오프사이드 해제: 파랑 한 대라도 x = −0.1이면 해제 안 됨, 전원 x ≤ −0.2면 offside-clear 1회.
10. 파랑 키퍼가 blue 골대에 뒤에서 걸침: penalty 1회, 머물러도 반복 없음, 뒤로 완전히 빠졌다 다시 걸치면 1회 더.
11. active false: Call 없음.
12. match.ts: `offside on:true` 두 번 = 기록 1개, `by` 기록, CSV 기체 열, 예전 v1 저장본 복원.
13. 방장 통합(net.test.ts의 MemoryTransport 방식): store 시작→경기 중으로 시간 진행 → 파랑 스트라이커를 red 골대 앞에서 +x 속도로 둠 → advance → store 파랑 1점·오프사이드, 학생이 `call` goal과 `match`를 받음. 준비 카운트다운 중 ARM 무시, 일시정지 시 `disarm` 수신, 시작 시 출발 대형.
14. decode: 새 메시지 3종 정상/비정상.

## 지킬 것
- 비행 모델·스틱·스로틀·물리 상수 값은 바꾸지 않는다(링 관련 상수만 constants.ts에 추가 가능).
- 안전 규칙: ARM 조건·blur DISARM·1초 무입력 DISARM 그대로. `__DRONE_QA`는 읽기 전용.
- 새 패키지·git 금지. `find . -name '._*' -not -path './node_modules/*' -delete` 후 빌드·테스트.

## 끝내는 조건
`npm test`·`npm run build` 통과. `REPORT-RULES1.md`에 만든 파일·테스트 이름·남은 의문을 쓰고 마지막 줄 `DONE`. 상한 35분.
