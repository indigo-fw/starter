---
title: Často kladené otázky
type: page
description: Často kladené otázky o [[SITE_NAME]] — instalace, přizpůsobení, správa obsahu a nasazení.
seoTitle: "FAQ | [[SITE_NAME]]"
noindex: false
---

## Obecné otázky

### Co je [[SITE_NAME]]?

[[SITE_NAME]] je open-source, agentově řízený CMS a SaaS starter postavený na T3 Stacku (Next.js, tRPC, Drizzle ORM, Better Auth). Poskytuje kompletní systém pro správu obsahu s SaaS prvky, jako jsou organizace, fakturace a upozornění v reálném čase.

### Pro koho je [[SITE_NAME]] určen?

[[SITE_NAME]] je navržen pro vývojáře a týmy, které vytvářejí SaaS produkty, marketingové weby, blogy nebo jakékoli aplikace založené na obsahu. Je obzvláště vhodný pro projekty využívající vývojové pracovní postupy s podporou umělé inteligence.

### Je [[SITE_NAME]] zdarma?

Ano. [[SITE_NAME]] je open source pod licencí AGPL-3.0. Můžete jej volně používat pro jakýkoli projekt. Komerční licence jsou k dispozici, pokud potřebujete vlastní nasazení bez požadavků AGPL.

## Technické otázky

### Jaký technologický stack [[SITE_NAME]] používá?

[[SITE_NAME]] je postaven s Next.js 16 (App Router), TypeScript, Tailwind CSS v4, tRPC, Drizzle ORM, PostgreSQL a Better Auth. Podporuje také Redis pro cachování a omezování rychlosti, BullMQ pro úlohy na pozadí a WebSockety pro funkce v reálném čase.

### Jak nasadím [[SITE_NAME]]?

[[SITE_NAME]] lze nasadit kdekoli, kde je podporován Node.js. Oblíbené volby jsou Vercel, Railway, Fly.io a jakýkoli VPS s Dockerem. Budete potřebovat databázi PostgreSQL a volitelně Redis pro plnou funkcionalitu.

### Mohu přizpůsobit design?

Rozhodně. [[SITE_NAME]] používá systém designových tokenů OKLCH s Tailwind CSS v4. Celou aplikaci můžete přeznačit změnou několika CSS vlastností pro odstín, světlost a sytost.

## Správa obsahu

### Jaké typy obsahu jsou podporovány?

Standardně [[SITE_NAME]] podporuje stránky, blogové příspěvky, položky portfolia, ukázkové karty, kategorie a štítky. Registr typů obsahu je řízen konfigurací, takže přidání nových typů vyžaduje minimální změny v kódu.

### Podporuje [[SITE_NAME]] více jazyků?

Ano. [[SITE_NAME]] má vestavěnou i18n s proxy-rewrite routováním lokalizace, překladovými skupinami pro obsah a překladovou lištou v administračním panelu. Nové lokalizace přidáte aktualizací jednoho konfiguračního pole.

### Mohu používat editor formátovaného textu?

Ano. Administrační panel obsahuje editor formátovaného textu založený na Tiptapu s podporou nadpisů, seznamů, obrázků, odkazů, bloků kódu a vlastních shortcodů. Obsah je ukládán jako Markdown pro zajištění přenositelnosti.
