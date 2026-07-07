---
title: Často kladené otázky
type: page
description: Často kladené otázky o %SITE_NAME% — inštalácia, prispôsobenie, správa obsahu a nasadenie.
seoTitle: "FAQ | %SITENAME%"
noindex: false
---

## Všeobecné otázky

### Čo je %SITE_NAME%?

%SITE_NAME% je open-source, agent-native CMS a SaaS starter postavený na T3 Stacku (Next.js, tRPC, Drizzle ORM, Better Auth). Poskytuje kompletný systém na správu obsahu so SaaS prvkami, ako sú organizácie, fakturácia a upozornenia v reálnom čase.

### Pre koho je %SITE_NAME% určený?

%SITE_NAME% je navrhnutý pre vývojárov a tímy, ktoré vytvárajú SaaS produkty, marketingové weby, blogy alebo akékoľvek aplikácie postavené na obsahu. Je obzvlášť vhodný pre projekty využívajúce vývojové pracovné postupy s podporou umelej inteligencie.

### Je %SITE_NAME% zadarmo?

Áno. %SITE_NAME% je open source pod licenciou AGPL-3.0. Môžete ho voľne používať v akomkoľvek projekte. Ak potrebujete proprietárne nasadenie bez požiadaviek AGPL, sú k dispozícii komerčné licencie.

## Technické otázky

### Aký technologický stack %SITE_NAME% používa?

%SITE_NAME% je postavený na Next.js 16 (App Router), TypeScripte, Tailwind CSS v4, tRPC, Drizzle ORM, PostgreSQL a Better Auth. Podporuje aj Redis na cachovanie a obmedzovanie počtu požiadaviek, BullMQ na úlohy na pozadí a WebSockety na funkcie v reálnom čase.

### Ako nasadím %SITE_NAME%?

%SITE_NAME% možno nasadiť kdekoľvek, kde je podporovaný Node.js. Obľúbenými voľbami sú Vercel, Railway, Fly.io a akýkoľvek VPS s Dockerom. Budete potrebovať databázu PostgreSQL a pre plnú funkcionalitu voliteľne Redis.

### Môžem si prispôsobiť dizajn?

Určite. %SITE_NAME% používa systém dizajnových tokenov OKLCH s Tailwind CSS v4. Celú aplikáciu môžete rebrandovať zmenou niekoľkých vlastných CSS vlastností pre odtieň, svetlosť a sýtosť.

## Správa obsahu

### Aké typy obsahu sú podporované?

%SITE_NAME% štandardne podporuje stránky, blogové príspevky, položky portfólia, ukážkové karty, kategórie a štítky. Register typov obsahu je riadený konfiguráciou, takže pridanie nových typov si vyžaduje minimálne zmeny v kóde.

### Podporuje %SITE_NAME% viacero jazykov?

Áno. %SITE_NAME% má vstavanú i18n so smerovaním jazykových verzií cez proxy-rewrite, prekladovými skupinami pre obsah a prekladovou lištou v administračnom paneli. Nové jazyky pridáte aktualizáciou jediného konfiguračného poľa.

### Môžem používať editor formátovaného textu?

Áno. Administračný panel obsahuje editor formátovaného textu založený na Tiptape s podporou nadpisov, zoznamov, obrázkov, odkazov, blokov kódu a vlastných shortcodov. Obsah sa ukladá ako Markdown na zabezpečenie prenositeľnosti.
