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
