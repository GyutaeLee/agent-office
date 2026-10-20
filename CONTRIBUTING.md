# 기여 가이드

환경·실행은 [README](README.md), 데이터 경계는 [SECURITY.md](SECURITY.md)를 참고하세요. 실제 계정 없이 합성 데이터로 개발·검증합니다.

## 코드 컨벤션

| 항목 | 기준 |
| --- | --- |
| 형식 | UTF-8, LF, 끝 개행. 공백 2개, Rust 4개. `.editorconfig` 기준 |
| 이름 | 컴포넌트·타입 `PascalCase`, TS 함수·변수 `camelCase`, Rust `snake_case` |
| TypeScript | strict 유지, 작은따옴표·세미콜론. 표현 가능한 타입에 `any` 추가 금지(테스트 브리지 모의 객체 제외) |
| 화면 | 한국어 문구·영어 식별자, 원시 이벤트·명령어·경로 비노출, 접근성·일반/미니 보기 확인 |
| 수명 관리 | 구독·타이머·이벤트 해제, 숨겨진 화면의 애니메이션 중지 |
| 기록 해석 | UI와 분리, 부분·알 수 없는 이벤트 허용, 미확인 상태 단정 금지 |
| 변경 범위 | 최소 변경, 포맷 변경은 기능 변경과 분리. 주석은 선택 이유·한계 설명 |

`package-lock.json`과 `src-tauri/Cargo.lock`은 의존성을 바꿀 때 갱신합니다.
Node/Rust 설정은 `.node-version`·`rust-toolchain.toml`에 있으며, `.tools/`의 Rust가 있으면 우선 사용합니다.
현재 자동 포맷·린트 검사는 없으며 CI에서 타입·동작·빌드를 검사합니다.

## 검증

| 변경 | 검사 |
| --- | --- |
| 기본 | `npm test`, `npm run audit`, `npm run test:replay`, `npm run build`, `npm run release:check` |
| UI | 최초 `npx playwright install chromium` 후 `npm run test:ui` |
| 네이티브 | `npm run desktop:build` + macOS 창 전환·전체 화면 위 표시 수동 확인 |
| 에셋 | 출처 확인, `npm run art:render` 후 이미지·배치 확인 |
| 배포 | [릴리스 검사](RELEASING.md) |

`npm test`는 파서·감시기 검사, UI의 네이티브 브리지는 모의 객체입니다.
`npm run audit`는 모델·프로세스·외부 요청 경계 검사이며 의존성 취약점 검사는 아닙니다.
재생용 `observer-probe`는 개발 전용 `probe` 기능으로만 빌드하며 배포에서 제외합니다.

PR에는 **문제·바뀐 동작·검증·한계**를 적고, UI 변경에는 합성 스크린샷을 첨부해 주세요.
재사용 코드·에셋의 출처와 라이선스는 [제3자 고지](THIRD_PARTY_NOTICES.md)에 기록합니다.
