# Latticework 시사: 이 프로젝트의 결정 사항 (아래 Expo 기본 안내보다 우선)

- 전체 구조와 운영 방법은 `WORK_STRUCTURE.txt`에 있다. 먼저 읽는다.
- 내비게이션은 Expo Router를 쓰지 않는다. 지금 웹 빌드는 주소 경로를 바꿀 수 없는 틀 안에서 뜨므로, `App.tsx`의 상태 기반 탭과 스택을 쓴다. 네이티브 빌드로 옮길 때 다시 검토한다.
- 이 클라우드 환경은 Expo 문서와 `expo install`이 쓰는 호스트가 막혀 있다. 패키지는 `node_modules/expo/bundledNativeModules.json`의 버전을 보고 `npm install`로 넣는다.
- 화면은 React Native 기본 컴포넌트와 `react-native-svg`만 쓴다. 웹 전용 코드는 `Platform.OS === 'web'` 분기 안에만 둔다.
- 데이터 접근은 `src/store.tsx` 한 곳에만 둔다. 화면은 `useStore()`만 쓴다.
- 웹 빌드와 확인: `npm run build:web` 후 `node scripts/shots.mjs light`. `out/`은 Claude 링크에 올리고, `docs/`는 커밋하면 자체 주소에 반영된다.
- `docs/data/feed.json`은 매일 아침 예약 작업이 main에 직접 커밋한다. 손으로 고치지 않는다. 작업 전에 `git pull`로 맞춘다.
- `expo lint`는 이 환경에서 설정 파일을 받지 못해 돌지 않는다. 타입 검사와 `scripts/shots.mjs`로 확인한다.

This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Commands

Use `bunx` instead of `npx` if the project uses bun (`bun.lock` present).

```bash
npx expo install <package>  # ALWAYS use instead of npm/yarn/pnpm/bun add — resolves SDK-compatible versions
npx expo start              # start the dev server
npx expo lint               # lint
npx tsc --noEmit            # typecheck
npx expo-doctor             # diagnose dependency and config issues
npx expo install --fix      # fix incompatible package versions
```

Run lint and typecheck before declaring any task done.

## Navigation & Routing

- Use **Expo Router** for all navigation. Routes live in `src/app/` — every file there is a screen, `_layout.tsx` files define navigators. Keep non-route code (components, hooks, utils) outside `src/app/`.
- Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`.
- Docs: https://docs.expo.dev/router/introduction.md

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) — no local Xcode or Android Studio required. Run EAS CLI as `bunx eas-cli <command>` in Bun projects, or `npx eas-cli@latest <command>` otherwise; substitute that for bare `eas` in docs examples.
Docs: https://docs.expo.dev/eas/index.md

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md
