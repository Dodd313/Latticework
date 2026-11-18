# Latticework 시사

매일 경제 뉴스 두 건을 요약, 본문 정리, 전에 읽은 기사와의 연결과 함께 읽는 개인용 앱입니다.

- 구조와 운영 방법: `WORK_STRUCTURE.txt`
- 프로젝트 결정 사항: `AGENTS.md`
- 웹 빌드: `npm install` 후 `npm run build:web`
  - `out/` : Claude 비공개 링크에 올리는 파일
  - `docs/` : 자체 주소에 올리는 파일. `docs/data/feed.json`이 기사 묶음입니다.

프로젝트 뼈대는 Expo 템플릿에서 시작했습니다. 템플릿의 저작권 표시는 `third-party/expo-template-LICENSE`에 있습니다.
