---
title: Usein kysytyt kysymykset
type: page
description: Usein kysytyt kysymykset sivustosta %SITE_NAME% — asennus, mukauttaminen, sisällönhallinta ja käyttöönotto.
seoTitle: "UKK | %SITENAME%"
noindex: false
---

## Yleiset kysymykset

### Mikä on %SITE_NAME%?

%SITE_NAME% on avoimen lähdekoodin tekoälyagenttipohjainen CMS- ja SaaS-aloituspaketti, joka on rakennettu T3 Stackille (Next.js, tRPC, Drizzle ORM, Better Auth). Se tarjoaa täydellisen sisällönhallintajärjestelmän SaaS-primitiiveillä, kuten organisaatiot, laskutus ja reaaliaikaiset ilmoitukset.

### Kenelle %SITE_NAME% on tarkoitettu?

%SITE_NAME% on suunniteltu kehittäjille ja tiimeille, jotka rakentavat SaaS-tuotteita, markkinointisivustoja, blogeja tai muita sisältöpohjaisia sovelluksia. Se soveltuu erityisen hyvin projekteihin, jotka hyödyntävät tekoälyavusteisia kehitystyönkulkuja.

### Onko %SITE_NAME% ilmainen?

Kyllä. %SITE_NAME% on avointa lähdekoodia AGPL-3.0-lisenssillä. Voit käyttää sitä vapaasti mihin tahansa projektiin. Kaupallisia lisenssejä on saatavilla, jos tarvitset yksityistä käyttöönottoa ilman AGPL-vaatimuksia.

## Tekniset kysymykset

### Mitä teknologiapinoa %SITE_NAME% käyttää?

%SITE_NAME% on rakennettu Next.js 16:lla (App Router), TypeScriptillä, Tailwind CSS v4:llä, tRPC:llä, Drizzle ORM:llä, PostgreSQL:llä ja Better Authilla. Se tukee myös Redisiä välimuistiin ja nopeusrajoituksiin, BullMQ:ta taustatehtäviin ja WebSocketteja reaaliaikaominaisuuksiin.

### Miten %SITE_NAME% otetaan käyttöön?

%SITE_NAME% voidaan ottaa käyttöön missä tahansa, missä Node.js on tuettu. Suosittuja vaihtoehtoja ovat Vercel, Railway, Fly.io ja mikä tahansa VPS, jossa on Docker. Tarvitset PostgreSQL-tietokannan ja valinnaisesti Redisin täyden toiminnallisuuden saavuttamiseksi.

### Voinko mukauttaa ulkoasua?

Ehdottomasti. %SITE_NAME% käyttää OKLCH-suunnittelutokenijärjestelmää Tailwind CSS v4:n kanssa. Voit muuttaa koko sovelluksen brändin muuttamalla muutamia CSS-mukautettuja ominaisuuksia sävyn, vaaleuden ja krooman arvoille.

## Sisällönhallinta

### Mitä sisältötyyppejä tuetaan?

Oletuksena %SITE_NAME% tukee sivuja, blogikirjoituksia, portfoliokohteita, esittelykortteja, kategorioita ja tunnisteita. Sisältötyyppirekisteri on konfiguraatiopohjainen, joten uusien tyyppien lisääminen vaatii vain vähäisiä koodimuutoksia.

### Tukeeko %SITE_NAME% useita kieliä?

Kyllä. %SITE_NAME% sisältää sisäänrakennetun i18n-tuen proxy-rewrite-lokaalireitityksellä, sisällön käännösryhmillä ja käännöstyökalupalkilla hallintapaneelissa. Lisää uusia lokaaleja päivittämällä yksi konfiguraatiotaulukko.

### Voinko käyttää rikasta tekstieditoria?

Kyllä. Hallintapaneeli sisältää Tiptap-pohjaisen rikkaan tekstieditorin, joka tukee otsikoita, luetteloita, kuvia, linkkejä, koodilohkoja ja mukautettuja lyhytkoodeja. Sisältö tallennetaan Markdown-muodossa siirrettävyyden vuoksi.
