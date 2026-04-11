---
title: 자주 묻는 질문
type: page
description: %SITE_NAME%에 관한 자주 묻는 질문 — 설치, 커스터마이징, 콘텐츠 관리, 배포에 대해 안내합니다.
seoTitle: "FAQ | %SITENAME%"
noindex: false
---

## 일반 질문

### %SITE_NAME%이란 무엇입니까?

%SITE_NAME%은 T3 Stack(Next.js, tRPC, Drizzle ORM, Better Auth) 기반의 오픈 소스 AI 에이전트 중심 CMS 및 SaaS 스타터입니다. 조직, 결제, 실시간 알림 등 SaaS 기본 요소를 갖춘 완전한 콘텐츠 관리 시스템을 제공합니다.

### %SITE_NAME%은 누구를 위한 것입니까?

%SITE_NAME%은 SaaS 제품, 마케팅 사이트, 블로그 또는 콘텐츠 중심 애플리케이션을 구축하는 개발자와 팀을 위해 설계되었습니다. 특히 AI 기반 개발 워크플로를 활용하는 프로젝트에 적합합니다.

### %SITE_NAME%은 무료로 사용할 수 있습니까?

네. %SITE_NAME%은 AGPL-3.0 라이선스의 오픈 소스입니다. 모든 프로젝트에 무료로 사용할 수 있습니다. AGPL 요구 사항 없이 독점적으로 배포해야 하는 경우 상업용 라이선스를 이용할 수 있습니다.

## 기술 질문

### %SITE_NAME%은 어떤 기술 스택을 사용합니까?

%SITE_NAME%은 Next.js 16(App Router), TypeScript, Tailwind CSS v4, tRPC, Drizzle ORM, PostgreSQL, Better Auth로 구축되었습니다. 또한 캐싱 및 속도 제한을 위한 Redis, 백그라운드 작업을 위한 BullMQ, 실시간 기능을 위한 WebSocket을 지원합니다.

### %SITE_NAME%을 어떻게 배포합니까?

%SITE_NAME%은 Node.js를 지원하는 모든 환경에 배포할 수 있습니다. Vercel, Railway, Fly.io 또는 Docker가 설치된 VPS가 일반적인 선택입니다. PostgreSQL 데이터베이스가 필요하며, 전체 기능을 위해서는 선택적으로 Redis도 필요합니다.

### 디자인을 커스터마이징할 수 있습니까?

물론입니다. %SITE_NAME%은 Tailwind CSS v4와 함께 OKLCH 디자인 토큰 시스템을 사용합니다. 색조, 명도, 채도에 대한 CSS 사용자 정의 속성 몇 가지만 변경하면 전체 애플리케이션을 리브랜딩할 수 있습니다.

## 콘텐츠 관리

### 어떤 콘텐츠 유형이 지원됩니까?

기본적으로 %SITE_NAME%은 페이지, 블로그 글, 포트폴리오 항목, 쇼케이스 카드, 카테고리, 태그를 지원합니다. 콘텐츠 유형 레지스트리는 설정 기반이므로 새로운 유형을 추가할 때 최소한의 코드 변경만 필요합니다.

### %SITE_NAME%은 다국어를 지원합니까?

네. %SITE_NAME%은 프록시 리라이트 로케일 라우팅, 콘텐츠 번역 그룹, 관리자 패널의 번역 바 등 내장 i18n 기능을 갖추고 있습니다. 단일 설정 배열을 업데이트하면 새로운 로케일을 추가할 수 있습니다.

### 리치 텍스트 편집기를 사용할 수 있습니까?

네. 관리자 패널에는 제목, 목록, 이미지, 링크, 코드 블록, 사용자 정의 숏코드를 지원하는 Tiptap 기반 리치 텍스트 편집기가 포함되어 있습니다. 콘텐츠는 이식성을 위해 Markdown으로 저장됩니다.
