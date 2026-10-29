# RULES-1 구현 보고서

결론: 메카닉 구현 완료. `npm test` 20개 파일 / 263개 테스트 통과, `npm run build` 통과(tsc --noEmit 포함). 2026-10-29 23:08 KST 최종 검증.

## 만든 파일
- `src/rules/ring.ts`: 고리 기둥 최근접 거리, 구 충돌 보정·반사, 양쪽 골대 정의.
- `src/rules/passage.ts`: 슬랩 진입·이탈, 선분 교차점 보간, 정방향·역방향 통과, 뒤 진입 단발 사건.
- `src/rules/referee.ts`: 역할·방향·테두리·오프사이드 판정, 전원 복귀 해제, ARM 허용 조건.
- `src/rules/practice.ts`: 통과 추적 재사용, clean 통과 및 접촉 시작 횟수.
- `src/score/store.ts`: 공유 경기 상태, dispatch/subscribe, 기존 localStorage 저장·복원·storage 동기화.
- `src/rules/rules.test.ts`, `src/score/store.test.ts`: 순수 규칙 및 공유 저장소 회귀 테스트.

## 수정한 파일 및 중복 제거
- `src/sim/flight.ts`: 기존 collide 안에서 두 골대 충돌 처리. 비행 모델·상수 값 유지.
- `src/score/match.ts`: 명시적 offside on 값의 멱등 처리, by/auto/reason 기록, CSV 기체 열, 구 v1 저장본 호환.
- `src/score/view.ts`: 자체 상태·저장 처리를 공유 store로 대체. 기존 버튼·단축키·화면 유지.
- `src/net/host.ts`: formationFor로 출발 위치 계산 통합, 매 물리 스텝 심판, 100ms tick, 경기·판정 전파, ARM 차단·강제 해제·준비/정비 대형 복귀. 세트 종료 시각 이후 통과가 정비 중 득점으로 기록되지 않도록 만료 상태를 먼저 갱신.
- `src/net/protocol.ts`: v:1 유지, match/call/disarm 및 문자열·열거값·숫자 범위 검증.
- `src/net/client.ts`: 수신 시각을 포함한 경기 상태와 감소 시계, 최근 판정 5개, 강제 DISARM 사건 및 controls 초기화.
- `src/net/view.ts`: store 옵션 전달 및 forcedDisarm 시 input.armed=false 배선.
- `src/main.ts`: 하나의 store를 두 탭에 전달, 연습 추적 및 읽기 전용 QA 복사본 통계. 출발점/경기장 초기화 시 연습 통계도 초기화.
- `src/score/match.test.ts`, `src/score/view.test.ts`, `src/net/net.test.ts`, `src/net/view.test.ts`, `src/main.test.ts`: 기록·통신·배선 회귀 테스트 추가 및 저장 책임 이동 반영.

## 주요 테스트 이름과 확인 내용
- `records one clean centered forward passage at 3 and 30 m/s`: 속도별 단발 clean 통과.
- `keeps 0.09 clean and records a 0.12 rim passage despite its bounce`: 실제 링 충돌 반사 후 dirty 통과 유지.
- `reflects a body strike and never leaves penetration`: ρ=0.40에서 매 스텝 거리·반사 확인.
- `ejects an embedded center through the closest face`: 링 몸통 내부 중심 탈출.
- `does not count returning through the entry side`, `records reverse once`: 되돌아가기 및 역방향 통과.
- rules 테스트의 보간 교차점·양쪽 골대·실제 rim no-goal·뒤 진입 latch 사례: 보간, 좌표 반전, 무득점+오프사이드, 반복 페널티 방지.
- `awards a striker goal and offside, or only penalty when already offside`: 득점/오프사이드 중 페널티.
- `rejects guides without offside and rejects reverse striker passages with offside`: 역할 및 방향 판정.
- `clears offside once only when every body is home`: -0.1에서는 미해제, -0.2 전원 복귀 시 1회 해제.
- `penalizes own-goal back entry once until a full retreat`: 자기 골대 뒤 진입 단발·재진입.
- `updates tracking without calls when inactive`, `allows only free practice, active play and finished`: 비활성 판정 억제 및 ARM 조건.
- `practice counts clean passes and rising rim contacts only`: 연습 횟수.
- `automatic match records`, `shared match store`: 멱등 offside, 기체·자동 기록, CSV 및 구 v1 복원, 저장소 동기화.
- `renders automatic events dispatched by the shared host store`: 외부 득점 반영 및 스코어판 버튼의 동일 store 변경.
- `shares scoring, match clock, ARM gates and formation with clients`: MemoryTransport 방장·학생 득점/판정/경기 상태, 준비 중 ARM 차단, 일시정지 DISARM, 출발 대형.
- `advances expired match before pending goal`: 종료 경계 득점 방지.
- `keeps only five recent calls and clears controls on forced disarm`: 학생 최근 판정 제한 및 controls 안전 해제.
- `strictly validates match, call and disarm messages`: 신규 메시지 정상·비정상 입력.
- `forcedDisarm clears local ARM even before an armed snapshot arrives`: 학생 화면의 즉시 ARM 해제 배선.
- `하나의 경기 store를 두 탭에 연결하고 연습 통계는 복사본으로 공개한다`: 실제 엔트리 포인트의 공유 store 및 QA 읽기 전용 보장.

## 검증 및 남은 의문
- 지시한 `find . -name '._*' -not -path './node_modules/*' -delete` 실행 후 최종 테스트·빌드 수행.
- 새 패키지 및 git 명령 사용 없음. 새 HUD·문구·스타일·레이아웃 추가 없음.
- 별도 lint 스크립트는 없음. 빌드에 포함된 TypeScript 정적 검사는 통과.
- 준비 카운트다운 일시정지는 ready/멈춤/기록 없음만으로 자유 연습과 구분되지 않으므로 기존 history도 확인해 ARM을 차단함.
- 브리프 범위 내 알려진 미해결 메카닉 문제 없음. 실제 브라우저·실기기 간 WebRTC 경기와 시각 검증은 수행하지 않았으며, 이번 통합 근거는 MemoryTransport 및 DOM 이벤트 테스트임.
- Vite의 500kB 초과 청크 경고가 남음(생성 JS 753.84kB, gzip 201.04kB). 빌드 실패는 아니며 이번 메카닉 범위에서 번들 분할은 변경하지 않음.
DONE
