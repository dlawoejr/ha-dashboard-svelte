# HA Dashboard Project - Work Process Summary

이 문서는 지금까지 진행된 Home Assistant 커스텀 대시보드 프로젝트의 전체 진행 내역을 담고 있습니다.

## Phase 1: Vanilla JS 초기 프로토타입 개발 (ha-dashboard-vanilla)
*이 섹션은 SvelteKit으로 마이그레이션 하기 전, 순수 HTML/JS로 기틀을 잡았던 초창기 작업 내역입니다.*

1. **초기 요구사항 분석 및 뼈대 구축**
   - WebSocket을 이용한 실시간 상태 동기화 및 로그인 보안 적용 목표 설정.
   - `index.html`, `style.css`, 모듈형 JS 구조 셋업.
2. **HA 코어 구현 및 동적 UI 생성**
   - HA API(`ha-api.js`)를 통해 Registry(층, 구역, 엔티티) 정보 동적 패치 적용.
   - 좌측 플로어(Floor) 사이드바, 상단 구역(Area) 탭 라우팅 뷰 구현.
3. **엔티티 컨트롤 컴포넌트**
   - 스위치/조명(input_boolean, switch, light) 토글 기능 구현.
   - 슬라이더와 텍스트 입력이 실시간 동기화되는 고급 듀얼 컨트롤 UI(`input_number`) 개발.
4. **PWA 기반 구축**
   - 초기 `manifest.json` 및 `sw.js` 적용, 홈 화면 추가 아이콘 세팅.

---

## Phase 2: SvelteKit 마이그레이션 및 확장 (ha-dashboard / 현재)
*이 섹션은 프로젝트를 SvelteKit으로 이전한 후 고도화시킨 현재까지의 작업 내역입니다.*

1. **프로젝트 초기 설정 및 배포 환경 구성**
   - SvelteKit 어댑터를 `@sveltejs/adapter-cloudflare`로 변경하여 Cloudflare Pages 자동 배포 환경 구축 (GitHub 연동).
2. **상태 관리 및 UI 컴포넌트화 (Svelte)**
   - `ha-store.svelte.js`를 통한 전역 상태(State) 및 WebSocket 제어.
   - 사이드바, 탭, 엔티티 카드를 Svelte 컴포넌트로 완벽 분리.
3. **QR 코드 기반 모바일 간편 로그인 도입**
   - 데스크톱 화면에서 접속 URL과 토큰을 QR 코드로 생성(`QRConnect.svelte`).
   - 모바일 스캔 시 URL Query Parameter를 읽어 자동 로그인 라우팅 수행.
   - 데스크톱 사용자 페어링을 위한 "Copy URL Link" 클립보드 복사 기능 추가.
4. **PWA 점진적 웹 앱 문제 해결 (로컬 스토리지)**
   - 앱을 PWA로 설치 후 재실행 시 로그인 정보가 휘발되는 버그 해결 (QR 파라미터 접속 시 `localStorage` 에 인증 정보 영구 저장 적용).
5. **UI/UX 및 모바일 반응형 디자인 최적화**
   - 앱 초기 로딩 시 번쩍이는 현상(Flash) 제거 및 전용 뷰어(Loading Spinner) 도입.
   - 가로 폭이 좁은 폰 화면에서 사이드바가 가로 스크롤형(스와이프)으로 변환되도록 CSS 반응형 레이아웃 전면 수정.
   - 모바일 화면에서 불필요한 데스크톱용 [📱 Mobile] 버튼 자동 숨김 처리.
6. **PWA 앱 이름 동적 생성 (Dynamic Manifest)**
   - 안드로이드 환경에서 설치 시 앱 이름이 고정되는 현상 돌파를 위해 정적 매니페스트(`static/manifest.json`) 파일 삭제.
   - SvelteKit 서버 라우트(`+server.js`) 및 `<svelte:head>` 주입 방식을 통해, 사용자가 접속한 도메인의 서브도메인을 추출하거나 직접 텍스트로 입력한 앱 이름(`?name=...`)을 실시간으로 Manifest에 반영하여 스마트폰 바탕화면에 각기 다른 이름(집/회사)으로 설치되도록 완벽 구현.
7. **WebSocket 자동 재연결 (Auto-Reconnect) 구현**
   - **문제**: 안드로이드 PWA에서 홈 화면으로 나갔다가 돌아오면 WebSocket이 끊어져 로그인 창이 뜨는 현상 발생.
   - **원인 분석 과정**:
     - 1차 시도: `visibilitychange` 이벤트로 화면 복귀 시 재접속 → 실패 (안드로이드가 `onclose` 이벤트를 즉시 발생시키지 않아 `connectionStatus`가 여전히 `connected`로 보임).
     - 2차 시도: WebSocket `onclose` 이벤트에 직접 5회 재접속 루프 장착 → 실패 (`onerror` + `onclose` 이중 발사로 인한 경쟁상태(Race Condition) + 이전 죽은 소켓 미정리로 유령 콜백 충돌).
     - 3차 시도: Race Condition 수정 (`reconnectScheduled` 가드 플래그 + `ha.disconnect()` 소켓 정리 메서드 추가) → 실패 (안드로이드 좀비 소켓이 `readyState === OPEN`이라고 거짓 보고하여 모든 수동 감지 실패).
   - **4차 수정 - 능동적 Ping/Pong 건강 검진**:
     - `ha-api.js`에 `ping()` 메서드 추가: HA 서버에 `{type:'ping'}` 메시지를 전송하고 3초 내 `{type:'pong'}` 수신 확인. 좀비 소켓 해결.
     - `visibilitychange` 이벤트만을 유일한 재접속 진입점으로 통일하여 이벤트 경쟁 상태 완화.
   - **5차 수정 - 오프라인 무한 재시도 (Infinite Retry)**:
     - `ERR_INTERNET_DISCONNECTED` 발생 시 5회 시도 후 포기하던 로직을 **지수 백오프(Exponential Backoff)** 기반의 **무한 재시도 루프**로 변경. (URL/토큰 오류인 `Auth failed` 시에만 중단).
     - 무한 로딩 중 빠져나갈 수 있도록 `Cancel / Change Server` 버튼 추가.
   - **6차 수정 - 초기 연결 onclose 경쟁 상태 해결**:
     - 오프라인 상태에서 `new WebSocket()` 시도 시 `onerror`와 `onclose`가 즉각 연속 발생. 
     - 5차의 무한 루프가 돌기도 전에 `onclose`가 상태를 `disconnected`로 덮어써버리는 문제 발견.
     - `ha-api.js`에서 한 번이라도 정상 연결(`onopen`)되었던 소켓만 `onclose` 이벤트를 발생시키도록 가드(`connectedOnce`) 추가.
   - **7차 최종 수정 - Ping 검사와 WebSockets onclose간의 악질적 동시성 버그(Race Condition) 철결**:
     - 화면 복귀 시점(`visibilitychange`)에 날린 3초짜리 Ping(`verifyConnection`) 대기 시간 도중, 인터넷이 복구되어 시스템 자체의 `onclose` 이벤트가 발생.
     - `onclose`가 정상적으로 새 소켓을 만들며 무한 루프(`reconnect`)를 돌기 시작했는데, Ping 검사가 뒤늦게 "아까 그 옛날 소켓 응답 없네"라며 **새로 만들어진 소켓을 강제로 부수고** 상태를 `disconnected`로 덮어버림.
     - 결과적으로 무한 접속 루프는 백그라운드에서 계속 도는데 UI는 로그인 창에 갇히는 기현상 발생.
     - `verifyConnection` 로직이 Ping 전/후의 소켓 인스턴스를 비교(`ha === originalHa`)하여, 도중에 소켓이 교체되었다면 기존 결과를 기각하도록 수정. `isReconnectingLock`을 통해 락(Lock) 보완.
8. **부수 버그 수정**:
   - 로그인 입력창에 `ws://...api/websocket` 주소가 노출되던 URL 오염 버그 수정 (`Login.svelte`에서 `ws://` → `http://` 정규화).
   - `static/sw.js` 캐시 버전 `v1 → v2`로 변경하여 옛날 Vanilla JS 프로젝트의 잔여 캐시 강제 삭제 + WebSocket 캐시 우회.
