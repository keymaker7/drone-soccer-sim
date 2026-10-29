# 1단계 구현 보고서

## 결과

`BRIEF-STAGE1.md`를 기준으로 1단계 코드를 구현했다. `npm test` 12개 전부 통과, `npm run build` 성공, TypeScript 오류 0개다. 실제 브라우저 렌더링 및 사용자 입력 경로는 실행 환경 제약으로 검증하지 못했으며, 아래에 구분한다.

## 만든 것 / 변경 파일

| 파일 | 내용 |
|---|---|
| `index.html` | 한국어 문서·viewport, 조종 정보, 접을 수 있는 키 안내, WebGL 시작 실패 안내 |
| `tsconfig.json` | strict TypeScript, `**/._*` 제외 |
| `vite.config.ts` | `base: './'`, Vitest 기본 제외 항목 유지 및 `**/._*` 제외 |
| `src/sim/constants.ts` | 경기장·드론·골대 규격, 비행·입력·카메라·렌더링 조정 상수 |
| `src/sim/input.ts` | 유지형 스로틀, 키 상태, 저스로틀 ARM 차단, 공용 포커스 상실 안전 처리 |
| `src/sim/flight.ts` | 순수 TS 비행 상태, 수동 추력·중력·선형 항력, ANGLE PD 복원, 요 회전, 구·경기장 경계 충돌 |
| `src/sim/clock.ts` | 120 Hz accumulator, 긴 프레임 제한, 누적 시간 초기화 |
| `src/sim/flight.test.ts` | 12개 회귀·규격 테스트 |
| `src/render/scene.ts` | Three.js 경기장·중앙선·그물·링 2개·드론 1대, LOS/추적/전체/심판 카메라, 시선 오프셋·FOV |
| `src/main.ts` | requestAnimationFrame과 고정 물리 루프 연결, 키·blur·hidden 이벤트 연결, 리셋, HUD, 읽기 전용 QA 훅 |
| `src/style.css`, `src/env.d.ts` | 한국어 화면 스타일, Vite 타입 참조 |
| `REPORT-STAGE1.md` | 구현·검증·제약·상수 기록 |
| `dist/` | 검증 완료한 정적 빌드 산출물 |

- x는 길이, y는 높이, z는 폭이다. 골대 링은 정확한 내·외경을 가진 원환을 두께 0.16 m로 돌출하고 x축에 수직으로 배치했다.
- 드론은 지름 0.40 m 와이어 보호구, 파란 내부 기체, 초록 스트라이커/전방 표시로 구성했다.
- 카메라 1은 x=-9.5, y=1.7의 고정 LOS 위치에서 드론을 바라본다. 2·3·5를 지원하고 4는 비워 두었다. 카메라 전환 시 시선 오프셋을 초기화한다.
- 페이지 최초 상태는 DISARM·스로틀 0이다. Space 반복 키 입력은 무시한다. blur/hidden 및 Backspace는 스로틀과 눌린 키를 초기화한다.
- `window.__DRONE_QA.state()`는 지정된 상태 필드와 카메라 번호를 반환한다. 위치·속도는 복사본이며, 상태 변경 함수는 제공하지 않는다. QA 객체는 동결했고 window 속성 재할당도 차단했다.
- 단순화: 외부 물리엔진 없이 순수 함수로 비행/충돌을 구성하고, blur·hidden·리셋에 같은 안전 처리 함수를 재사용했다.
- 새 패키지 설치 및 git 명령을 실행하지 않았다. 2단계 이후의 규칙·10대·전체 경기 HUD·게임패드·AI는 추가하지 않았다.

## 검증한 것

2026-10-29 로컬 실행 결과:

| 테스트 이름 | 결과 |
|---|---|
| 55% 호버에서 수직 가속도 절댓값 0.3 m/s² 미만 | PASS; 1초 후 높이 유지도 확인 |
| 100% 상승, 0% 및 DISARM에서 낙하 | PASS |
| 최대 피치 35° 이하, 스틱 해제 후 2초 이내 3° 이내 복원 | PASS |
| W는 전진 +x, D는 오른쪽 +z, Q는 왼쪽 요 회전 | PASS |
| 대각선 입력과 방향 전환에서도 전체 기울기 35° 이하 | PASS |
| 6개 경계 고속 충돌 후 반지름을 포함해 경기장 안에 유지 | PASS; 각 축 ±10,000 m/s 입력 후 반사·경계 확인 |
| 첫 로드 상태는 DISARM, 스로틀 0이고 이륙하지 않음 | PASS; 순수 모델 5초 계산 |
| 5% 초과 ARM 거부, 5% 이하 ARM 허용, DISARM은 항상 허용 | PASS |
| blur/hidden 공용 안전 처리 → 즉시 DISARM + 스로틀 0 + 눌린 키 해제 | PASS; 이벤트 핸들러가 호출하는 순수 함수 테스트 |
| 스로틀은 누르는 동안 증감, 해제 시 유지, 0~100% 제한 | PASS |
| 16 ms와 50 ms 화면 간격에서 1초 후 위치 차이 1 cm 미만, 정확히 120회 실행 | PASS |
| 긴 프레임은 0.25초로 제한하며 reset은 남은 누적 시간을 지움 | PASS |

- `npm test`: 테스트 파일 1개, 테스트 12개 통과.
- `npm run build`: `tsc --noEmit` 및 Vite 빌드 성공, 타입 오류 0개.
- 빌드/테스트 전에 `find . -name '._*' -not -path './node_modules/*' -delete` 실행.
- `src/sim/`에 `three` 의존성이 없음을 텍스트 검색으로 확인했다.
- 빌드된 HTML의 JS/CSS URL이 `./assets/...` 상대 경로임을 확인했다.
- 별도 lint/static-analysis 도구나 스크립트는 제공된 프로젝트에 없으므로 실행하지 않았다. strict 타입 검사는 실행했다.

## 검증 못 한 것 / 남은 위험

- 개발 서버 실행 시 `listen EPERM: operation not permitted 127.0.0.1:5173`가 발생했다. sandbox 권한을 변경하거나 우회하지 않았다.
- ego-browser는 시스템 연결 오류와 `Failed to start ego lite`로 시작하지 못했다. 브라우저 스크린샷·시각 판정은 확보하지 못했다.
- 실제 WebGL 렌더 결과, 가림·가독성, 우클릭 드래그·휠, 카메라 전환, 도움말 접기, 키보드 비행, 실제 창 blur/탭 hidden 이벤트 연결, QA 훅의 브라우저 동작은 미검증이다. 위 단위 테스트는 실제 브라우저 이벤트 검증을 대신하지 않는다.
- GitHub Pages 하위 경로의 실배포와 모바일/Chromebook/iPad 성능은 미검증이다.
- 빌드 경고 1건: Three.js 포함 JS 청크 약 573.97 kB, gzip 146.75 kB로 기본 500 kB 경고 기준을 초과한다. 빌드 실패나 타입 오류는 아니다.
- 긴 정지 프레임은 최대 0.25초만 계산한다. 이는 복귀 시 과도한 물리 누적을 막기 위한 의도적 시간 제한이다.
- 경계 충돌은 반지름을 고려해 위치를 경기장 안으로 제한하고 속도를 반사한다. 한 스텝 안의 다중 반사 궤적까지 복원하는 모델은 아니다.
- 골대 충돌은 1단계 범위에 따라 생략했다. 다중 드론 충돌·규칙 판정은 이후 단계 대상이다.
- 실기체 비행감과 계수의 실측 일치는 검증하지 않았다.

## 조정 상수 표

모든 조정 항목의 원본은 `src/sim/constants.ts`다.

| 상수 | 값 | 의미 |
|---|---|---|
| `mass` / `radius` | 0.9 kg / 0.20 m | 기체 질량 / 보호구 반지름 |
| `gravity` | 9.81 m/s² | 중력 |
| `hoverThrottle` | 0.55 | 수평·정지 상태 호버 스로틀 |
| `MAX_THRUST` | 약 16.0527 N | 질량 × 중력 ÷ 0.55 |
| `arena` | ±8 / 0~4.5 / ±3.5 m | x / y / z 경계 |
| `goal` | x=±6.5, y=3, 반지름 0.30/0.50, 두께 0.16 m | 골대 위치 및 규격 |
| `start` | (-5.5, 0.20, 0) m | 파랑 팀 출발점 |
| `step` | 1/120 s | 고정 물리 간격 |
| `maxFrameTime` / `clockEpsilon` | 0.25 s / 1e-10 s | 누적 제한 / 부동소수점 허용치 |
| `maxTilt` | 35° | ANGLE 최대 기울기 |
| `attitudeKp` / `attitudeKd` | 32 / 11 | 기울기 PD 제어 |
| `yawRate` | 100°/s | 최대 요 명령 속도 |
| `linearDrag` | 0.22 kg/s | 선형 항력 계수 |
| `restitution` | 0.35 | 벽·바닥·천장 반발 계수 |
| `throttleRate` | 0.30/s | 초당 스로틀 30%p 증감 |
| `armThreshold` | 0.05 | ARM 허용 상한 |
| `camera.los` | (-9.5, 1.7, 0) m | LOS 고정 위치 |
| `camera.overview` / `camera.referee` | (-13,11,13) / (0,3,10) m | 전체 / 심판 위치 |
| `camera.followDistance` / `followHeight` | 2.4 / 1.2 m | 추적 카메라 거리·높이 |
| `camera.fov` / `minFov` / `maxFov` | 65° / 30° / 90° | 기본·최소·최대 시야각 |
| `camera.near` / `far` | 0.05 / 150 m | 카메라 클리핑 |
| `camera.dragSensitivity` / `maxOffset` | 0.003 rad/px / 1.2 rad | 시선 드래그 감도·제한 |
| `camera.wheelSensitivity` | 0.04 | 휠 시야각 감도 |
| `render.maxPixelRatio` | 2 | 렌더 픽셀 비율 상한 |
| `render.netSpacing` / `netOpacity` | 0.5 m / 0.12 | 그물 간격·불투명도 |
| `render.floorMargin` / `floorThickness` / `lineWidth` | 2 / 0.08 / 0.04 m | 바닥 확장·두께·중앙선 |
| `render.cageSegments` / `cageRings` / `goalSegments` | 16 / 10 / 64 | 보호구·골대 분할 |
| `render.bodyRadius` / `bodyHeight` | 0.075 / 0.045 m | 내부 기체 크기 |
| `render.armSpan` / `armWidth` | 0.26 / 0.018 m | 내부 프레임 크기 |
| `render.rotorOffset` / `rotorRadius` | 0.092 / 0.05 m | 로터 배치·반지름 |
| `render.markerRadius` / `markerX` | 0.045 / 0.12 m | 초록 역할 표시 크기·위치 |
| `render.ambientIntensity` / `sunIntensity` | 2 / 3 | 환경광·방향광 |

DONE
