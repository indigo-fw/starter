---
title: Perguntas frequentes
type: page
description: Perguntas frequentes sobre o [[SITE_NAME]] — instalação, personalização, gestão de conteúdos e implementação.
seoTitle: "FAQ | [[SITE_NAME]]"
noindex: false
---

## Perguntas gerais

### O que é o [[SITE_NAME]]?

[[SITE_NAME]] é um CMS e starter SaaS de código aberto orientado por agentes de IA, construído sobre o T3 Stack (Next.js, tRPC, Drizzle ORM, Better Auth). Fornece um sistema de gestão de conteúdos completo com primitivas SaaS como organizações, faturação e notificações em tempo real.

### Para quem é o [[SITE_NAME]]?

[[SITE_NAME]] é concebido para programadores e equipas que criam produtos SaaS, sites de marketing, blogs ou qualquer aplicação orientada a conteúdos. É especialmente adequado para projetos que aproveitam fluxos de trabalho de desenvolvimento assistido por IA.

### O [[SITE_NAME]] é gratuito?

Sim. [[SITE_NAME]] é de código aberto sob a licença AGPL-3.0. Pode utilizá-lo livremente para qualquer projeto. Licenças comerciais estão disponíveis caso necessite de uma implementação proprietária sem os requisitos da AGPL.

## Perguntas técnicas

### Que stack tecnológico utiliza o [[SITE_NAME]]?

[[SITE_NAME]] é construído com Next.js 16 (App Router), TypeScript, Tailwind CSS v4, tRPC, Drizzle ORM, PostgreSQL e Better Auth. Suporta também Redis para cache e limitação de taxa, BullMQ para tarefas em segundo plano e WebSockets para funcionalidades em tempo real.

### Como implemento o [[SITE_NAME]]?

[[SITE_NAME]] pode ser implementado em qualquer plataforma que suporte Node.js. As opções populares incluem Vercel, Railway, Fly.io e qualquer VPS com Docker. Necessitará de uma base de dados PostgreSQL e opcionalmente Redis para a funcionalidade completa.

### Posso personalizar o design?

Certamente. [[SITE_NAME]] utiliza um sistema de tokens de design OKLCH com Tailwind CSS v4. Pode alterar a identidade visual de toda a aplicação modificando algumas propriedades personalizadas CSS para os valores de matiz, luminosidade e croma.

## Gestão de conteúdos

### Que tipos de conteúdo são suportados?

Por predefinição, [[SITE_NAME]] suporta páginas, publicações de blog, elementos de portfólio, cartões vitrine, categorias e etiquetas. O registo de tipos de conteúdo é orientado por configuração, pelo que adicionar novos tipos requer alterações mínimas no código.

### O [[SITE_NAME]] suporta vários idiomas?

Sim. [[SITE_NAME]] dispõe de internacionalização integrada com encaminhamento de localização por proxy-rewrite, grupos de tradução para conteúdos e uma barra de tradução no painel de administração. Adicione novos idiomas atualizando um único array de configuração.

### Posso utilizar um editor de texto enriquecido?

Sim. O painel de administração inclui um editor de texto enriquecido baseado em Tiptap com suporte para títulos, listas, imagens, ligações, blocos de código e shortcodes personalizados. O conteúdo é armazenado em formato Markdown para garantir a portabilidade.
