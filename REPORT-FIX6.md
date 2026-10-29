# FIX-6 완료 보고

기본 스로틀을 쉬움으로 변경했다. 올림 키를 누르면 상승하고, 놓으면 천천히 내려온다. 실제 조종기 방식은 기존처럼 값을 유지하며 선택할 수 있다.

## 구현

- `src/sim/climb.ts`: 순수 PI 상승 속도 제어기. 목표는 올림 +1.5 m/s, Shift+올림 +0.5 m/s, 중립 −0.5 m/s, 내림 −1.8 m/s. 호버 추력과 속도 오차로 계산하고 0–100% 제한, 적분 포화 방지, 기울기 보정 최대 1.4배를 적용했다.
- `src/sim/flight.ts`, `src/sim/input.ts`: 기존 0.08초 모터 지연 유지. 바닥에서 올림이 없으면 추력·속도 0으로 정지한다. 쉬움 ARM은 올림 키에서 손을 뗀 상태에서만 허용한다. 실제 방식의 구간별 조절·값 유지 동작은 유지했다.
- `index.html`, `src/main.ts`, `src/style.css`: 조작 안내에 쉬움/실제 선택과 T 단축키를 추가했다. DISARM에서만 전환하며 localStorage 접근은 try/catch로 보호했다. 실제 추력·수직 속도, 쉬움의 중앙 복귀 스틱, 모드별 첫 비행 카드를 표시한다. QA 상태에 throttleMode와 vy를 추가했다.
- `src/net/view.ts`, `src/net/client.ts`, `src/net/host.ts`, `src/net/protocol.ts`: 학생이 throttleMode/climb/fine을 전송하고 host가 연습과 동일한 제어기로 계산한다. host 추력·수직 속도를 학생 HUD에 표시한다. v:1 유지, 새 필드는 선택 사항이며 모드 필드가 없으면 manual이다. 시동 중 방식 변경 차단과 DISARM·입력 타임아웃 안전 동작을 유지했다.
- `src/sim/climb.test.ts`, `src/sim/flight.test.ts`, `src/sim/throttle.test.ts`, `src/sim/keymap.test.ts`, `src/main.test.ts`, `src/net/net.test.ts`, `src/net/view.test.ts`: 쉬움 검증을 추가하고 기존 실제 스로틀 회귀 테스트는 manual을 명시해 계속 검증한다.

## 검증

- `._*` 삭제 후 `npm test`: 17개 파일, 221개 테스트 통과.
- `npm run build`: TypeScript 검사 및 Vite 프로덕션 빌드 통과.
- 중립·올림·내림·미세 상승의 2초 내 요구 오차 수렴, 올림 해제 후 하강과 착지, 바닥 정지, 30° 전진 중 하강, 천장 유지, 두 스틱 모드 ARM 규칙 통과.
- 연습과 host의 동일 입력 4초 비행 상태 일치, 옛 v:1 manual 메시지, 선택 필드 검증, 쉬움 ARM, 전환 제한, DISARM 패킷 중립화 통과.
- 실제 엔트리 이벤트 테스트로 T/버튼·저장·첫 비행 안내·스틱 복귀·포커스 및 탭 이동 안전 정지를 검증했다.
- HTML 중복 ID 없음, main.ts의 모든 정적 요소 ID가 HTML에 존재함을 확인했다.
- 별도 lint 스크립트는 없으며 TypeScript 정적 검사로 확인했다.

## 단순화와 남은 제한

연습과 함께 경기의 상승 제어를 한 순수 모듈로 공유했다. 새 패키지를 추가하지 않았고 git 명령은 사용하지 않았다.

실브라우저 화면·실기기·실제 WebRTC 연결 시험은 미검증이다. 개발 서버 시작이 `listen EPERM 127.0.0.1:5173`으로 차단됐고 ego-lite도 sandbox에서 시작하지 못했다. 화면 판정 미실행 사유는 `.omx/state/fix6/ralph-progress.json`에 기록했다. LSP 도구는 승인 정책으로 차단되어 빌드의 `tsc --noEmit`으로 대체했다. 빌드에는 500 kB 초과 번들 경고가 남아 있으나 오류는 없다.

DONE
