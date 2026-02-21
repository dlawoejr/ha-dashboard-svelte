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
