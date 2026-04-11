---
title: Domande frequenti
type: page
description: Domande frequenti su [[SITE_NAME]] — installazione, personalizzazione, gestione dei contenuti e distribuzione.
seoTitle: "FAQ | [[SITE_NAME]]"
noindex: false
---

## Domande generali

### Che cos'è [[SITE_NAME]]?

[[SITE_NAME]] è un CMS e starter SaaS open source guidato da agenti IA, costruito sul T3 Stack (Next.js, tRPC, Drizzle ORM, Better Auth). Fornisce un sistema di gestione dei contenuti completo con primitive SaaS come organizzazioni, fatturazione e notifiche in tempo reale.

### A chi è rivolto [[SITE_NAME]]?

[[SITE_NAME]] è progettato per sviluppatori e team che realizzano prodotti SaaS, siti di marketing, blog o qualsiasi applicazione orientata ai contenuti. È particolarmente adatto a progetti che sfruttano flussi di lavoro di sviluppo assistito dall'IA.

### [[SITE_NAME]] è gratuito?

Sì. [[SITE_NAME]] è open source con licenza AGPL-3.0. Può utilizzarlo liberamente per qualsiasi progetto. Sono disponibili licenze commerciali qualora si necessiti di una distribuzione proprietaria senza i requisiti dell'AGPL.

## Domande tecniche

### Quale stack tecnologico utilizza [[SITE_NAME]]?

[[SITE_NAME]] è costruito con Next.js 16 (App Router), TypeScript, Tailwind CSS v4, tRPC, Drizzle ORM, PostgreSQL e Better Auth. Supporta inoltre Redis per la cache e la limitazione della frequenza, BullMQ per le attività in background e i WebSocket per le funzionalità in tempo reale.

### Come si distribuisce [[SITE_NAME]]?

[[SITE_NAME]] può essere distribuito ovunque sia supportato Node.js. Le scelte più diffuse includono Vercel, Railway, Fly.io e qualsiasi VPS con Docker. È necessario un database PostgreSQL e, facoltativamente, Redis per la piena funzionalità.

### È possibile personalizzare il design?

Certamente. [[SITE_NAME]] utilizza un sistema di token di design OKLCH con Tailwind CSS v4. È possibile modificare l'identità visiva dell'intera applicazione cambiando alcune proprietà personalizzate CSS per i valori di tonalità, luminosità e saturazione.

## Gestione dei contenuti

### Quali tipi di contenuto sono supportati?

Per impostazione predefinita, [[SITE_NAME]] supporta pagine, articoli del blog, elementi del portfolio, schede vetrina, categorie ed etichette. Il registro dei tipi di contenuto è basato sulla configurazione, pertanto l'aggiunta di nuovi tipi richiede modifiche minime al codice.

### [[SITE_NAME]] supporta più lingue?

Sì. [[SITE_NAME]] dispone di internazionalizzazione integrata con routing locale tramite proxy-rewrite, gruppi di traduzione per i contenuti e una barra di traduzione nel pannello di amministrazione. È possibile aggiungere nuove lingue aggiornando un singolo array di configurazione.

### È possibile utilizzare un editor di testo avanzato?

Sì. Il pannello di amministrazione include un editor di testo avanzato basato su Tiptap con supporto per intestazioni, elenchi, immagini, collegamenti, blocchi di codice e shortcode personalizzati. I contenuti vengono archiviati in formato Markdown per garantire la portabilità.
