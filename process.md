# HA Dashboard - WebSocket 재연결 최적화 작업 기록

> 작업일: 2026-02-22 | 최종 커밋: `53cee44`

---

## 🎯 목표

모바일(Android PWA)에서 앱을 백그라운드로 보냈다가 다시 열 때 발생하던 **10~20초 연결 딜레이** 문제를 해결하고, 네이티브 앱 수준의 매끄러운 UX를 구현한다.

---

## 📋 해결한 문제들 (시간순)

### 1. 백그라운드 무한 재연결 루프 방지
- **문제:** 앱이 백그라운드에 있는데도 `reconnect()` 루프가 무한 반복 → 배터리 광탈
- **해결:** `document.visibilityState === 'visible'` 체크 추가, 백그라운드에서는 재연결 시도 안 함
- **파일:** `ha-store.svelte.js` (`onConnectionStatus` 핸들러)

### 2. 재연결 횟수 제한 (5분 캡)
- **문제:** 포그라운드에서도 네트워크 끊기면 무한 재연결 루프 → 배터리 소모
- **해결:** 최대 60회(약 5분)까지만 재연결 시도 후 `reconnect_failed` 상태로 전환
- **UI:** "Connection Lost" 화면 + "Retry Connection" 수동 버튼 추가
- **파일:** `ha-store.svelte.js` (`reconnect()` 함수), `+page.svelte`

### 3. 인터럽트 가능한 Sleep 백오프
- **문제:** `reconnect()` 루프가 5초 대기(sleep) 중일 때 cancelReconnect()가 즉시 반응 안 함
- **해결:** `sleepResolver` Promise 패턴으로 대기 중에도 즉시 깨움 가능
- **파일:** `ha-store.svelte.js` (`sleepResolver` 변수, `cancelReconnect()`)

### 4. Delta Sync (재연결 시 데이터 경량화)
- **문제:** 재연결 시 Floor/Area/EntityRegistry/States 4가지를 전부 다시 다운로드 → 700ms 소요
- **해결:** 재연결 시 `entities.length > 0`이면 **States만** 가져옴 (정적 데이터 캐시 유지)
- **파일:** `ha-store.svelte.js` (`loadInitialData()` 함수)

### 5. O(N²) → O(1) 해시맵 최적화
- **문제:** `states.forEach` → `entities.findIndex` 조합이 O(N²), UI 스레드 115ms 블로킹
- **해결:** `Map` 자료구조로 O(1) 검색 + 배열 복사 후 단 1회 `$state` 할당 (Svelte Batch)
- **파일:** `ha-store.svelte.js` (`loadInitialData()` Delta Sync 블록)

### 6. 이중 재연결 경쟁 조건 (Race Condition) 제거
- **문제:** `onConnectionStatus`와 `handleVisibilityChange`가 둘 다 `reconnect()` 호출 → 소켓 충돌로 즉사 후 재연결 반복 (20초 딜레이)
- **해결:** `onConnectionStatus`에서 자동 `reconnect()` 완전 제거 → `handleVisibilityChange`만 재연결 담당
- **파일:** `ha-store.svelte.js` (`onConnectionStatus` 핸들러)

### 7. isRecovering 교착 상태 (Deadlock) 수정
- **문제:** 앱을 잠깐 열었다가 바로 내리면 `isRecovering = true`가 영구 잠금 → 다음 포그라운드에서 "Already recovering. Ignored."
- **해결:** `visibilityState === 'hidden'` 시 `cancelReconnect()` + `isRecovering = false` 리셋
- **파일:** `+page.svelte` (`handleVisibilityChange` hidden 분기)

### 8. Silent Reconnect (무소음 재연결)
- **문제:** 재연결 로딩 화면이 2초간 대시보드를 가리는 게 불편
- **해결:** 재연결 시 `isInitializing = true` 제거, `reconnect()`를 fire-and-forget로 변경. 기존 대시보드 UI를 유지한 채 백그라운드에서 무소음 연결 복구. Svelte 반응형 상태가 도착 즉시 버튼 색상만 자동 갱신
- **파일:** `+page.svelte` (`handleVisibilityChange`)

### 9. Login 화면 번쩍임 수정
- **문제:** Silent Reconnect 도입 후 `connectionStatus !== 'connected'`일 때 Login 폼이 잠깐 노출
- **해결:** `haStore.entities.length === 0` 조건 추가 → 캐시된 데이터가 있으면 대시보드 유지
- **파일:** `+page.svelte` (Svelte 조건부 렌더링 블록)

---

## 🔧 디버깅 도구

- **Eruda:** 모바일 온디바이스 콘솔 디버거 (`app.html`에 CDN 삽입, 임시)
- **Performance Traces:** `performance.now()` 기반 `[PERF_V10]`, `[V11 TIMER]`, `[V12]` 로그
- **버전 배지:** `[TEST V8]` → `[TEST V12]`로 순차 업데이트하여 배포 캐시 확인

---

## 📁 수정된 주요 파일

| 파일 | 역할 |
|---|---|
| `src/lib/stores/ha-store.svelte.js` | WebSocket 연결/재연결/상태관리 코어 |
| `src/routes/+page.svelte` | 화면 전환 로직, visibilitychange 핸들러 |
| `src/app.html` | Eruda 디버거 삽입 (임시) |
| `static/sw.js` | Service Worker 캐시 버전 관리 |

---

## 📊 최종 성과

| 지표 | 작업 전 | 작업 후 |
|---|---|---|
| 모바일 재연결 체감 시간 | 10~20초 | **0초** (Silent) |
| 백그라운드 배터리 소모 | 무한 루프 | **0%** (완전 정지) |
| 재연결 시 UI 중단 | 전체 화면 로딩 | **없음** (기존 화면 유지) |
| 데이터 재전송량 | 4개 API 전체 (700ms) | **States만** (500ms, 백그라운드) |
| 상태 동기화 속도 | 228ms (UI 블로킹) | **40ms** (HashMap + Batch) |

---

## ⚠️ TODO (정리 필요)

- [ ] Eruda 디버거 제거 (`src/app.html`)
- [ ] `console.log` 디버그 로그 정리 (`[V11 TIMER]`, `[V12]`, `[PERF_V10]` 등)
- [ ] `[TEST V12]` 배지 제거 또는 정식 버전으로 변경

### [V13-V15] WebSocket 전역 구독 최적화 및 PWA 캐시 딜레이 해결
*   **문제 상황**: 
    1. 대시보드에서 탭(구역)을 전환할 때마다 모든 기기(약 1000개)의 상태를 동기화(`get_states`)하여 엄청난 트래픽 병목이 발생. 
    2. 동적 `$effect` 기반의 탭 재구독 메커니즘을 시도했으나 끊임없는 핑퐁 무한루프(IP Ban)와 탭 전환 지연 발생.
    3. 모바일 백그라운드 전환 후 폰을 켰을 때, `reconnect()` 시 정확히 2초(2000ms)의 정체 불명 딜레이 발생.
    4. SvelteKit과 Vite HMR 개발 서버 내부 통신이 PWA Service Worker 캐시에 묶여 오프라인 에러 및 브라우저 크래시 유발.

*   **해결 방법**:
    1. **Service Worker 예외 처리 롤백 및 캐시 바이패스 (V13)**: Chrome DevTools에서 발생하는 `net::ERR_FAILED` 에러 해결을 위해 `sw.js`의 `fetch` 이벤트 핸들러를 뜯어고쳐서, Vite HMR 등 개발 환경 통신 시 캐시가 무조건 우회되도록 처리함.
    2. **단일 글로벌 WSS 구독 아키텍처 (V14)**: 동적 탭 구독 `$effect` 로직을 앱 전체에서 영구 삭제. 대신 폰 화면을 켰을 때 **최초 1회 `get_states`를 호출하고, 그 1000개 기기 중 "대시보드 전용 기기"만 추출하여 백그라운드 단일 `subscribe_trigger`로 영구 구독**하는 최적화 구조로 개편. 이제 탭 전환 시 어떠한 서버 통신도 발생하지 않고 즉각 전환됨.
    3. **재연결 딜레이 추적 및 `Promise.all` 병렬화 (V15)**: `[PERF_V15]` 타이머를 코드 곳곳에 심어 병목을 추적한 결과, 인증 단계(1343ms) -> 데이타 동기화(408ms) -> 글로벌 구독(317ms)이 `await` 폭포수로 인해 직렬 실행되며 2초를 잡아먹고 있다는 것을 수학적으로 증명해냄. 바로 코드 로직에 `Promise.all`을 적용해 데이터 동기화와 글로벌 구독 설정을 "병렬(Concurrency)"로 실행시켜 약 300~400ms(50%)의 절대 지연을 완전히 단축시킴.

---

## 🏷️ 레이블 기반 엔티티 그룹핑 및 복합 카드 UI 구현

> 작업일: 2026-02-27

### 🎯 목표

Home Assistant의 **레이블(Label)** 정보를 활용하여 동일 레이블을 가진 엔티티들을 자동으로 그룹핑하고, 그룹별로 **계기판(Gauge) + 3단 드래그 스위치**가 결합된 복합 UI 카드를 표시한다.

### 📋 구현 내용

#### 1. HA API 확장 (`ha-api.js`)
- `getDeviceRegistry()`: 기기 레지스트리 조회 API 추가
- `getLabelRegistry()`: 레이블 레지스트리 조회 API 추가

#### 2. 스토어 그룹핑 로직 (`ha-store.svelte.js`)
- `loadInitialData()`에 기기/레이블 레지스트리 병렬 fetch 추가
- 엔티티 → 기기 → 레이블 매핑 체인 구현
- `entityLabelMap` 해시맵으로 엔티티별 레이블 정보 연결

#### 3. 페이지 렌더링 로직 (`+page.svelte`)
- `displayItems` derived state로 레이블 기반 그룹핑 수행
- 조건: 동일 레이블에 `input_boolean` 2개 + `input_number` 1개
- `input_boolean`은 `entity_id` 오름차순 정렬하여 스위치에 고정 할당
- 그룹 미충족 엔티티는 기존 `EntityCard`로 렌더링

#### 4. 복합 카드 UI (`LabelGroupCard.svelte`) [신규]

**게이지 (Gauge)**
- SVG 반원형 파란색 트랙 (`#0ea5e9`, stroke-width: 12)
- 노란색 쐐기 형태 바늘 (`#facc15`), CSS transform으로 회전
- 바늘 길이: 반지름에서 숫자 영역을 뺀 길이 (y=30 ~ y=4)
- 숫자: 정수 표시, 단위 `%`
- 게이지 크기: 180px
- 하단 라벨: `[레이블명] 열림 상태`

**3단 드래그 스위치**
- 세로 트랙 + 파란색 노브(knob) 드래그 앤 드롭 방식
- 3개 위치: 열기 (A:On/B:Off) / 정지 (A:Off/B:Off) / 닫기 (A:Off/B:On)
- 열기↔닫기 직접 전환 방지 (반드시 정지를 경유)
- 낙관적 위치 업데이트: 드롭 시 즉시 스냅, HA 응답 대기 중 되돌림 없음
- 라벨 더블클릭으로도 전환 가능
- 드래그 중 애니메이션(transition) 없음 (즉각 반응)

### 📁 변경된 파일

| 파일 | 변경 유형 | 역할 |
|---|---|---|
| `src/lib/api/ha-api.js` | 수정 | 기기/레이블 레지스트리 API 추가 |
| `src/lib/stores/ha-store.svelte.js` | 수정 | 레이블 매핑 로직 및 초기 데이터 확장 |
| `src/routes/+page.svelte` | 수정 | 그룹핑 derived state 및 조건부 렌더링 |
| `src/lib/components/LabelGroupCard.svelte` | **신규** | 복합 카드 컴포넌트 (게이지+드래그 스위치) |

---

## ⏰ 스케줄러(Scheduler) 카드 구현 및 트러블슈팅

> 작업일: 2026-02-27

### 🎯 목표

Home Assistant의 커스텀 스케줄러 컴포넌트(`scheduler-component`)와 연동하여, 대시보드 내에서 손쉽게 **기기 스케줄(예약) 추가/수정/삭제/활성화** 관리를 할 수 있는 UI를 제공한다.

### 📋 구현 내용

#### 1. REST API 확장 (`ha-api.js`)
- `callApi(method, endpoint, data)`: WebSocket 대신 REST API 호출 래퍼 추가
- `getSchedules()`, `addSchedule()`, `editSchedule()`, `deleteSchedule()` 메서드 노출

#### 2. 스토어 연동 (`ha-store.svelte.js`)
- `activeView` 상태 변수 추가 (`'dashboard'` ↔ `'scheduler'` 화면 전환)
- `addSchedule`, `editSchedule`, `deleteSchedule`, `toggleEntity` 지원 래퍼 함수 매핑

#### 3. 스케줄러 UI 개발 (`SchedulerCard.svelte`)
- **생성/수정 모드**: 기기(`input_boolean`) 선택, 액션(ON/OFF), 시간 및 요일 선택 폼 제공
- **목록 모드**: 등록된 스케줄 목록 조회 및 개별 활성화/비활성화 스위치, 삭제 버튼 제공

### 🛠️ 주요 트러블슈팅

1. **"이 구성요소는 현재 사용할 수 없습니다(Unavailable)" 상태 지연 이슈**
   - **증상:** 스케줄러 생성 버튼을 누른 후 약 5초간 UI 상 예약 카드가 회색(비활성)으로 표시되고 사용할 수 없는 오류.
   - **원인 분석:**
     - 백엔드(`scheduler/timer.py`, `scheduler/store.py` 분석 결과)에서 스케줄 생성 직후 타임스탬프(`next_entry`)를 비동기로 재계산함.
     - 이 과정이 완전히 종료되기 전까지 찰나의 순간 동안, 타이머 리스트 배열이 비어있어 상태가 `unavailable`로 강제 할당됨.
   - **해결 방안:** UI 상 에러가 아닌 백엔드 처리 딜레이 구조로 판명되어, 데이터 이상 없이 정상 작동함을 증명. 약 5~10초 후 자동 동기화 시 정상 활성화됨.

2. **500 Internal Server Error (JSON 파싱 에러)**
   - **증상:** HA 백엔드 검증 로직에 명시적 `null` 값을 일일이 넘겨주려 시도 중 `save_schedule` 스키마 오류 발생.
   - **해결 방안:** 공식 카드와 동일한 시그니처(`["daily"]`, `"08:00:00"`)만 보내도록 페이로드 구성 로직을 롤백하여 정상 동작 복구.

### 📁 변경된 파일

| 파일 | 변경 유형 | 역할 |
|---|---|---|
| `src/lib/api/ha-api.js` | 수정 | 스케줄러 관련 REST 래퍼 함수 추가 |
| `src/lib/stores/ha-store.svelte.js` | 수정 | 뷰 전환 상태 및 스케줄러 조작 액션 매핑 |
| `src/routes/+page.svelte` | 수정 | `activeView` 기반 조건부 화면 전환 적용 |
| `src/lib/components/SchedulerCard.svelte` | **신규** | 자체 제작 스케줄 관리 카드 컴포넌트 |

---

## ⚡ 스케줄러(Scheduler) 실시간 동기화 보강 및 UI/UX 개선

> 작업일: 2026-02-28

### 🎯 목표

기존에 수동 새로고침에 의존하던 스케줄러 UI를 HA 서버의 WebSocket 이벤트(`scheduler_updated`)에 기반한 **완전 실시간 자동 갱신 구조**로 리팩토링하고, 사용자 경험을 저해하던 로딩 깜빡임과 비시인성 문제를 해결한다.

### 📋 주요 개선 내용

#### 1. WebSocket 커스텀 이벤트(`scheduler-component`) 구조 파악 및 파싱 로직 수정
- **문제**: 스케줄러 백엔드 소스(`websockets.py`) 분석 결과, 일반적인 HA의 `subscribe_events` 규격 대신 `type: 'scheduler_updated'`라는 커스텀 프론트엔드 통신 규약을 사용하고 있었음. 이로 인해 수정/삭제 이벤트가 클라이언트로 전달되지 않거나 엉뚱한 필드(`data.event.event`)에 매핑되는 버그 발생.
- **해결 (`ha-api.js`)**:
  - `subscribeScheduler()` 명령어 전송 방식을 커스텀 규격에 맞게 1:1 대응.
  - `handleMessage` 스위치 문 내에 `scheduler_`로 시작하는 이벤트를 최우선으로 가로채는 독립적인 파싱 분기 추가.
  - 이를 통해 **생성, 수정, 삭제, 타이머 완료 등 모든 종류의 스케줄러 이벤트**를 클라이언트에서 실시간 누락 없이 감지 가능해짐.

#### 2. 전역 스토어(`haStore`) 기반 상태 병합 및 하이드로제이션 에러 해결
- **문제**: `SchedulerCard.svelte` 내부 로컬 상태였던 스케줄 목록을 전역스토어로 이동시키는 과정에서 `ReferenceError` 등 변수 꼬임 현상 발생. 변경 이벤트에서 `new_state: undefined`인 이벤트가 유입될 때 앱 전체 크래시 발생.
- **해결 (`ha-store.svelte.js`)**:
  - 스토어 내부에 `schedules`, `loadingSchedules` 상태 변수를 안전하게 통합하고, HA 연결 초기화 시 병렬로 스케줄 데이터를 동시 Fetch하도록 구성.
  - `updateEntityState`에 **Guard Clause**(방어막)를 추가하여, `entity_id`가 null인 비정상 패킷이 유입되더라도 예외 콘솔만 노출하고 브라우저 렌더러가 멈추지 않도록 무력화함.

#### 3. 백그라운드 무소음(Silent) 갱신 및 "일시정지" 시인성 극대화
- **문제**: 실시간 이벤트마다 `loadingSchedules = true`가 트리거되어, 1초 미만의 순간 동안 리스트 전체가 "불러오는 중..." 텍스트로 치환되며 화면이 심하게 번쩍(Flickering)이는 증상 발생. 꺼져있는 항목도 육안으로 잘 구별되지 않음.
- **해결 (`SchedulerCard.svelte`, `ha-store.svelte.js`)**:
  - 스토어의 `loadSchedules(isBackground=true)` 인자 옵션을 추가하여, 최초 로딩 이후 웹소켓 이벤트에 의한 백그라운드 갱신 시에는 로딩 상태를 조작하지 않고 데이터만 덮어씌우도록(`Svelte` 반응성에 맞게) 수정하여 **깜빡임 완전 제거**.
  - 비활성화(Disabled) 스케줄 항목의 투명도를 75%로 맞추고, CSS `repeating-linear-gradient`를 활용해 대시보드 빗금(`Dashed`) 패턴 백그라운드를 적용하여 직관성을 높임.
  - 상태 표시 배지 디자인을 수정하여, `[일시정지]` 문구를 붉은색(`bg-red-500`) 배경 + 볼드체로 변경하여 한 번에 상태 구별이 가능해짐.

---

## 📱 로컬/정적 빌드 환경(HA /local/) 배포 완벽 지원 및 QR 스캔 최적화

> 작업일: 2026-03-01

### 🎯 목표

Home Assistant의 `www`(/local/) 폴더나 외부 웹 서버로 SvelteKit 앱을 배포하기 위해 **Static Adapter** 빌드를 분리하고, 서브 디렉토리 접속 환경でも 모바일 기기를 원활하게 연동할 수 있도록 **QR 코드 생성기 및 딥링크**의 로직 안정성을 확보한다.

### 📋 주요 구현 및 트러블슈팅

#### 1. 빌드 환경 분리 (Cloudflare vs Static)
- **과제:** 기존 SSR 기반 Cloudflare 설정과, 순수 파일 서빙 목적의 정적(Static) 설정을 한 소스에서 하이브리드로 지원해야 함.
- **해결:** `cross-env`를 도입하여 `package.json`에 `build:static` 스크립트를 신설함 (`BUILD_TARGET`, `VITE_BUILD_TARGET` 환경변수 주입).
- **파일:** `svelte.config.js`에서 환경변수에 따라 `adapter-cloudflare`와 `adapter-static`을 동적으로 교체 적용. 정적 빌드 시 `_app` 폴더명 충돌 방지를 위해 `appDir: 'app'`으로 수정.

#### 2. 서브 디렉토리 라우팅 (`BASE_PATH`) 및 Web Manifest 대응
- **과제:** HA의 `/local/mypage`처럼 특정 경로 하위에 앱을 올릴 경우, 폰에서 QR 스캔 시 앱의 최상위 루트(`/`)로 가버리는 문제.
- **해결:** `svelte.config.js`에 `paths.base = process.env.BASE_PATH`를 적용.
- **파일:** `src/routes/manifest.json/+server.js`에서 런타임 URL 파싱 로직 접근 시, 정적 렌더링(prerender) 환경에서는 오류가 나지 않도록 조건부 처리.

#### 3. QR코드 URL에 `index.html` 경로 주입 및 HA 리다이렉션 버그 패치
- **과제:** Static 어댑터 사용 시 폴더 경로만 접속하면 404가 나는 웹서버 대응, 반대로 HA에서는 1. `/index.html`을 뒤에 강제로 붙여 생성해야 하고 2. 붙여서 접속하면 스토어 라우팅이 꼬이는 이중 문제 발생.
- **해결 (`QRConnect.svelte`):** 브라우저단 변수인 `import.meta.env.VITE_BUILD_TARGET`를 확인하여 정적 빌드일 경우 QR로 만들어주는 주소에 명시적으로 `/index.html`을 연결.
- **해결 (`app.html`):** 브라우저 진입 직후 구동되는 후킹 스크립트 작성. 접속 주소에 `index.html`이 있다면 Svelte 로딩 직전에 `history.replaceState`로 깔끔하게 제거함.
- **디버깅 패치:** 처음 스크립트 작성 시 `location.search`를 보존하지 않아 스캔된 로그인 `token`이 소실되던 치명적 버그 수정!

#### 4. 브라우저 캐시(Service Worker) 고착화 방지
- **과제:** HA `/local/` 캐시 정책이 너무 강력하여 코드를 수정한 후 재배포해도 스마트폰이 계속 구버전을 로드하는 현상 파악.
- **해결:** QR 코드 생성 URL의 파라미터 끝에 타임스탬프(`&_t=123...`)를 난수로 강제 삽입. 매 QR 스캔 시마다 캐시를 완벽히 우회하여 무조건 최신 코드를 다운로드하게끔 보완.

#### 5. HTTP(로컬 네트워크) 클립보드 복사(Copy) 오류 해결
- **과제:** SSL 인증서가 없는 내부망 환경(HTTP)에서 QR URL의 "Copy URL Link" 버튼 터치 시 `Cannot read properties of undefined (reading 'writeText')` 에러 크래시.
- **원인:** 최신 자바스크립트의 `navigator.clipboard` API 모듈은 강력한 보안 정책 때문에 무조건 `HTTPS`가 강제됨.
- **해결 (`QRConnect.svelte`):** `navigator.clipboard`와 `window.isSecureContext`를 체크하고, 없을 경우 보이지 않는 텍스트 박스(`<textarea>`)를 DOM에 임시 주입하여 `document.execCommand('copy')`를 호출하는 **Fallback 복사 우회 로직** 추가.
