# HA Dashboard Project - Work Process Summary

이 문서는 지금까지 진행된 Home Assistant 커스텀 대시보드(SvelteKit) 프로젝트의 주요 작업 내역과 개선 사항들을 시간순/기능별로 정리한 히스토리 파일입니다.

## 1. 프로젝트 초기 설정 및 배포 환경 구성
* **SvelteKit 어댑터 변경:** 원활한 Cloudflare Pages 배포를 위해 기본 어댑터(`adapter-auto`)에서 `@sveltejs/adapter-cloudflare`로 마이그레이션 진행.
* **GitHub 연동 및 자동 배포:** 소스 코드를 관리할 로컬/원격 GitHub 저장소를 초기화(`ha-dashboard-svelte`)하고, Cloudflare Pages와 GitHub를 연동하여 push 시 자동 빌드/배포되도록 환경 구축.

## 2. 홈 어시스턴트(HA) 코어 연동 및 UI 기본 틀
* **상태 관리 (Store):** `ha-store.svelte.js`를 구현하여 HA의 URL 및 장기 접근 토큰(Long-Lived Access Token)을 앱 전역에서 관리하고, WebSocket으로 상태를 실시간 동기화.
* **로그인 및 대시보드 컴포넌트:** 수동으로 URL과 토큰을 기입할 수 있는 `Login.svelte` 컴포넌트와 연결 성공 시 렌더링되는 레이아웃(`Sidebar.svelte`, `Tabs.svelte`, `EntityCard.svelte`) 구현.

## 3. QR 코드 기반 모바일 간편 로그인 도입
* **QR 생성기 (`QRConnect.svelte`):** 데스크톱 화면에서 현재 접속된 HA 주소와 토큰 정보를 담은 URL(`?url=...&token=...`)을 QR 코드로 생성하여 모달 창으로 제공.
* **자동 로그인 라우팅 (`+page.svelte`):** 모바일로 QR 스캔 후 진입 시 URL Query Parameter를 분석하여, 해당 정보가 있으면 로그인 과정을 생략하고 즉시 HA와 연결하도록 `onMount` 로직 구현. (보안을 위해 연결 후 URL 창의 토큰 정보는 history API로 숨김 처리)
* **데스크톱 편의성 강화:** 모바일 환경 외에도 다른 PC 브라우저나 메신저로 쉽게 접근 링크를 넘길 수 있도록 QR 모달 내 **"Copy URL Link (링크 복사)"** 기능 추가.

## 4. PWA(점진적 웹 앱) 로컬 스토리지 영구 저장 문제 해결
* **문제점 발견:** 모바일 사파리/크롬에서 홈 화면에 추가(PWA 설치) 후 앱을 열었을 때, QR로 넘겨받은 정보가 휘발되어 다시 로그인 창이 뜨는 버그 확인.
* **해결책 (Local Storage):** QR 코드를 통해 최초 파라미터로 접속하거나 직접 로그인에 성공했을 때, 브라우저의 `localStorage` 공간에 `ha_url`과 `ha_token`을 영구 저장하도록 수정. 앱을 껐다 켜도 스토리지에서 정보를 우선적으로 불러와 연결 유지.

## 5. UI/UX 및 모바일 반응형 디자인 최적화
* **초기 로딩 깜빡임(Flash) 제거:** `isInitializing` 상태 플래그를 추가하여, 로컬 스토리지에서 토큰을 불러오고 연결을 시도하는 짧은 시간 동안 로그인 창 대신 부드러운 전용 **로딩 스피너(Loading Spinner)**를 노출.
* **기기 맞춤형 요소 렌더링:** CSS `@media (max-width: 768px)` 쿼리를 활용해, 화면이 좁은 모바일 환경에서는 굳이 필요 없는 데스크톱용 `[📱 Mobile]` (QR Connect) 버튼을 자동으로 숨김(`desktop-only` 클래스).
* **레이아웃 반응형 개선:** `app.css`를 수정하여 좁은 화면에서 사이드바가 상단 가로 스크롤형 탭으로 찌그러지지 않고 렌더링되며, 대시보드의 엔티티 카드들이 다단 그리드에서 1열 기둥 구조(`flex-direction: column`)로 완벽하게 변환되도록(잘림 방지) 조치.

## 6. PWA 앱 이름 동적 생성 (Dynamic Manifest)
* **문제점 발견:** 안드로이드 특정 환경에서는 PWA 설치("홈 화면에 추가") 시 사용자가 앱 이름을 임의로 수정할 수 없도록 Block되어 있어, 도메인(집/회사) 별로 다른 이름으로 앱을 설치하기 어려움.
* **정적 파일 제거:** 기존 `static/manifest.json` 파일을 완전히 삭제.
* **동적 서버 라우트(`+server.js`) 생성:** `src/routes/manifest.json/+server.js` 엔드포인트를 구축하여 브라우저의 설치 요청 시 실시간으로 JSON 텍스트를 조합해 응답하도록 변경.
* **명칭 결정 로직 우선순위:**
  1. **수동 입력 (`?name=...`):** QR 코드를 생성하기 직전 모달창에서 사용자가 입력한 `appName` 텍스트를 1순위로 채택.
  2. **서브도메인 추출 (Fallback):** URL 파라미터를 유실하더라도, 접속한 도메인(예: `home.abc.com`)의 앞부분(서브도메인, 'home')을 자동으로 추출 후 첫 글자를 대문자로 변환하여 앱 이름으로 배정.
* **타이밍(캐시) 이슈 해결:** SvelteKit 렌더링 타이밍 문제로 안드로이드 브라우저가 예전 매니페스트를 낚아채는 현상을 막기 위해, `document.getElementById` 방식의 수동 DOM 조작 코드를 폐기. 대신 `+layout.svelte` 최상단에 `<svelte:head>` 블록을 선언하고 동적 컴포넌트 변수(`$derived`)를 매핑하여, **SSR(서버 사이드 렌더링) 단계의 HTML 자체에 완벽한 동적 파라미터 링크가 주입**되어 내려가도록 아키텍처 개선.
