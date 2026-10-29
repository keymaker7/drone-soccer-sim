# RULES-1-UI 구현 보고서

결론: 현재 계약으로 가능한 경기 화면 구현 및 자동 검증 완료. `npm test` 21개 파일 / 271개 테스트 통과, `npm run build` 통과(TypeScript 검사 포함). 계약에 없는 항목은 아래 「메카닉 요청」으로 분리했다. 전체 요구사항의 실기기 출시 판정은 보류하며, 실측 시각 검증은 하지 못했다.

## 구현 내용 및 변경 파일
- `src/net/view.ts`: 방장 점수·팀 이름·세트 승·페널티·단계·시계·오프사이드 띠, 경기 시작/일시정지/계속·되돌리기·확인 후 초기화, 준비/정비/종료/자유 연습 안내. 자동 기록의 득점·페널티·오프사이드 알림은 2.5초씩 순서대로 표시한다. 득점·페널티 소리는 스코어판 store의 muted 설정을 따르며 함께 경기 탭이 활성일 때 재생을 시도한다.
- 같은 파일: 학생의 작은 점수 띠·내 팀 오프사이드 경고, 수신 call 1.8초 순차 알림·내 팀/기체 강조, 경기 상태로 확인 가능한 ARM 잠금(클릭과 Space 모두), 역할 한 줄 설명, 강제 DISARM 알림. 기존 안전 정지·입력 안전 처리와 모두 시동 끄기·연결 진단·시험 결과 복사는 유지했다.
- `src/net/match-ui.ts`: 한국어 판정 문구, 단계 안내, ARM 잠금 안내, 알림 큐를 표현 전용 함수로 분리했다. 판정 엔진이나 메시지 형식은 변경하지 않았다.
- `src/net/style.css`: 기존 남색·파랑·빨강·연두 팔레트를 재사용했다. 점수 64px, 시계 48px, 경기장 내부 절대 배치, 3초 오프사이드 강조와 reduced-motion 정지, 학생용 축소 띠. 머리말은 「함께 경기」 및 「DRONE SOCCER / MATCH」로 바꿨다.
- `src/main.ts`, `src/style.css`, `index.html`: 기존 연습 통계로 「골대 통과 n · 테두리 n」 칩, 비행 상태를 바꾸지 않는 기록 지우기, 통과/테두리 1.2초 알림. 기존 flight toast를 재사용했다. 작은 높이의 HUD 여백을 축소했고 인라인 SVG favicon을 추가했다.
- `src/score/view.ts`, `src/score/style.css`: 같은 창에서 방장 방이 연결되어 있으면 연결 띠 표시, 기체·자동/수동 판정 기록 칸, 중복 MATCH CONTROL 머리글 제거. 연결 실패·방 종료 시 띠를 해제하도록 main과 연결했다.
- `src/net/view.test.ts`, `src/net/match-ui.test.ts`, `src/main.test.ts`, `src/score/view.test.ts`: 관련 테스트 추가.
- `.omx/state/rules1-ui/ralph-progress.json`: visual-verdict 미검증 사유 기록. score 0은 미검증 표식이며 실제 화면 품질을 채점한 값이 아니다.

## 유지·단순화
- `src/rules/*`, `src/score/match.ts`, `src/score/store.ts`, `src/net/host.ts`, `src/net/client.ts`, `src/net/protocol.ts`의 메카닉·통신 계약은 수정하지 않았다.
- 새 패키지와 git 명령을 사용하지 않았다. 기존 store, 시계 포맷, 역할 이름, 연습 추적, toast를 재사용했다.
- `__DRONE_QA`의 기존 읽기 전용 인터페이스를 유지하고 net.state에 matchStrip 및 현재 toast를 추가했다.

## 검증
2026-10-29 23:15 KST 최종 코드 검증:
- `find . -name '._*' -not -path './node_modules/*' -delete` 실행 후 검사.
- `npm test`: 21개 파일, 271개 테스트 통과.
- `npm run build`: tsc --noEmit 및 Vite 빌드 통과.
- 별도 lint/static-analysis 스크립트는 package.json에 없다. 정적 검사는 빌드의 TypeScript 검사로 수행했다.
- 기존 500kB 청크 경고는 남음: JS 760.92kB, gzip 203.44kB. 빌드 실패는 아니다.

추가 검증 내용:
- store의 득점·페널티·오프사이드가 방장 점수 띠와 배지에 반영되고 알림이 순서대로 교체되는지 확인.
- 방장 경기 버튼이 같은 store의 시작·일시정지·계속·되돌리기에 연결되는지 확인.
- 학생 준비/일시정지/정비 안내 및 ARM 버튼·Space 차단, 역할 설명, 내 팀 알림 강조, 강제 해제 알림을 확인.
- 동일 문구의 연속 판정도 큐에서 누락되지 않고 2.5초씩 유지되는지 확인. 학생 알림은 1.8초 후 사라지고 같은 call 객체를 재수신 상태 갱신으로 중복 표시하지 않는지 확인.
- rim/not-striker/reverse/offside-pass/own-goal-back 등 모든 사유의 한국어 문구와 경기 종료 승수 안내 확인.
- 연습 통과·테두리 숫자와 1.2초 알림·기록만 초기화되는지, 스코어판 기체/자동 표시 및 연결 띠 배선 확인.
- DOM 테스트는 작은 element/session double을 사용한다. 실제 CSS 렌더링·WebRTC·오디오 재생을 검증한 것은 아니다.

## 배치 계산 근거 — 실측 아님
전제: CSS pixel 기준 브라우저 100% 배율, 기본 전역 border-box, 두 해상도 모두 폭 620px 초과. 실제 글꼴·줄바꿈·스크롤바 너비는 측정하지 않았다.

| 항목 | 1366×768 | 1024×640 |
| --- | ---: | ---: |
| 상단 탭 높이 | 64px | 64px |
| net-panel 높이 = H−64 | 704px | 576px |
| net 내부 높이 = H−64−상하 padding 16 | 688px | 560px |
| 머리말/하단 진단/두 gap | 36+28+16=80px | 36+28+16=80px |
| 경기장 행 높이 | 608px | 480px |
| 내부 가로 = W−좌우 padding 24 | 1342px | 1000px |
| 옆 패널 + 열 간격 | 290+10px | 260+10px |
| 경기장 외곽 폭 | 1042px | 730px |
| 경기장 위/아래 좌표 | y=116 / 724 | y=116 / 596 |

- 경기장 자식 scene은 `position:absolute; inset:0`, 점수 띠도 `position:absolute; top:10px; left:10px; right:10px`이다. 점수 띠는 grid 행 높이와 3D canvas 높이를 소비하지 않는다. 경기장 테두리 안쪽 scene은 각각 1040×606px / 728×478px로 계산된다.
- 방장 점수 띠 외곽 폭은 약 1020px / 708px이다. 1024px 화면에서 가운데 열 140px, 두 팀 열 각 약 271px를 확보한다. 팀 이름은 한 줄 말줄임 처리, 오프사이드 경고는 줄바꿈 가능하다. 양쪽 해상도 모두 점수 64px, 시계 48px를 적용한다.
- 기존 workspace의 overflow:clip을 유지했다. 방장 옆 패널만 overflow-y:auto, 학생은 ARM·추력 HUD를 고정하고 그 아래 안내만 스크롤한다. 경기장과 패널은 서로 다른 열이므로 패널의 스크롤이 경기장을 밀거나 덮는 구조가 아니다.
- fly canvas는 기존 H−64 높이를 유지한다. 연습 칩은 기존 absolute telemetry 안에 있으므로 canvas 레이아웃에 추가 행을 만들지 않는다. 높이 700px 이하에서 스틱 76→60px, 컨트롤러 상하 간격 합계 14px 감소, readings gap 9→6px로 세 간격 합계 9px 감소, 칩 하단 여백 12→8px를 적용했다. fly 패널의 최종 높이·헤더 간격·글꼴별 줄바꿈은 실측하지 않았으므로 실제 두 해상도 검증이 필요하다.

실측 시도는 환경에서 차단되었다:
- `npm run dev -- --host 127.0.0.1`: `listen EPERM: operation not permitted 127.0.0.1:5173`.
- `ego-browser nodejs`: macOS 서비스 연결 오류 및 `Failed to start ego lite`.
- 추가 권한 요청이나 우회 실행을 하지 않았다. 스크린샷, 시각 합격, 실제 WebRTC 교실 경기, iPad/Chromebook, 실제 소리는 미검증이다.

## 메카닉 요청
1. **방장의 모든 call 구독**: HostSession은 call을 학생 transport로만 broadcast하며 onChange나 공개 배열로 제공하지 않는다. 현재 화면은 store의 자동 score/penalty/offside 사건만 표시한다. 무효(no-goal)의 rim/not-striker/reverse는 store에 기록되지 않아 방장 화면에서 표시할 수 없다. 공개 call 구독 계약이 필요하다. 학생은 이미 노출된 calls로 모든 종류의 문구를 표시한다.
2. **학생의 정확한 armAllowed**: MatchSnapshot에는 phase/running/set/remaining/teams만 있고 records/history 및 armAllowed가 없다. 특히 ready+stopped는 자유 연습과 준비 일시정지를 구별할 수 없다. 화면은 안전을 위해 이 모호한 상태도 ARM을 잠근다. 따라서 경기 시작 전 학생 자유 연습 ARM이 제한되는 알려진 차이가 있다. host에서 계산한 armAllowed를 snapshot으로 제공해야 원래 자유 연습과 잠금 조건을 정확히 함께 보존할 수 있다. 학생 ready+stopped 안내도 현재는 일시정지 안내이며 정확한 자유 연습 여부를 추정하지 않는다.
3. **강제 DISARM 이유 노출**: ClientSession은 disarm 수신 시 reason을 저장/전달하지 않고 forcedDisarm 이벤트만 보낸다. 현재는 「선생님이 시동을 껐어요」까지 표시하며 괄호 이유를 지어내지 않는다. 이벤트에 reason 전달 또는 공개 lastDisarmReason이 필요하다. 기존 모두 시동 끄기는 별도 disarm 메시지 없이 state의 armed=false를 보낼 수도 있어, 그 경우 기존 원격 시동 해제 안내를 유지한다.

위 계약 요청은 브리프에 따라 메카닉을 수정하지 않고 남긴 범위 제한이다.
DONE
