# 릴리스 가이드

| 항목 | 현재 상태 |
| --- | --- |
| 버전·대상 | 0.1.0 준비 중 · Apple Silicon · macOS 13 이상 |
| 배포물 | 앱을 담은 ZIP + SHA-256. DMG·자동 업데이트·다른 OS 배포 없음 |
| 서명 | ad-hoc(`-`)만 제공. Developer ID·공증 없음, 다운로드 시 보안 경고 가능 |
| 검증 범위 | macOS 26.6.2에서 확인. 최소 OS·Intel·Universal의 수동 실행은 미검증 |

## 로컬 빌드

```sh
npm ci
npm run release:build
```

`release/`에 `Agent-Office-0.1.0-macos-arm64.zip`과 `.zip.sha256`을 생성합니다.
버전 일치·앱 서명·개발 바이너리 제외를 검사하며, 파일명은 실제 앱 아키텍처로 정합니다.
`release:package`는 기존 앱의 재압축만 수행합니다. 빌드·배포 결과는 Git에서 제외합니다.

배포 전 ZIP을 별도 폴더에 풀어 **실행·권한·서명·라이선스**를 확인합니다.
체크섬은 `release/`에서 `shasum -a 256 -c Agent-Office-0.1.0-macos-arm64.zip.sha256`으로 검사합니다.

## GitHub 배포

1. npm·Cargo·Tauri 버전(잠금 파일 포함)과 `CHANGELOG.md`를 갱신하고 `npm run release:check` 및 [개발 검사](CONTRIBUTING.md)를 통과시킵니다.
2. [승인 규칙](AGENTS.md)에 따라 커밋·푸시·릴리스 태그(예: `v0.1.0`) 푸시를 진행합니다.
3. **Actions → Draft macOS release → Run workflow**에 기존 태그를 입력합니다. 해당 태그에서 검사·빌드 후 ZIP·체크섬을 **초안**에 올립니다.
4. 파일과 변경 내용을 확인하고 공개 승인을 받은 뒤 **Publish release**를 실행합니다.

워크플로는 `macos-15` ARM64 러너를 사용하며 태그 생성·자동 공개·기존 릴리스 덮어쓰기를 하지 않습니다.
GitHub에서의 실제 실행은 첫 업로드 후 확인해야 합니다.

배포자 서명·공증을 추가할 때는 [Tauri 공식 절차](https://v2.tauri.app/distribute/sign/macos/)와 GitHub Secrets를 사용합니다. 인증서·키·비밀번호는 저장소·로그에 넣지 않습니다.
