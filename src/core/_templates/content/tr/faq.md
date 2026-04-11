---
title: Sıkça Sorulan Sorular
type: page
description: "[[SITE_NAME]] hakkında sıkça sorulan sorular — kurulum, özelleştirme, içerik yönetimi ve dağıtım."
seoTitle: "SSS | {sitename}"
noindex: false
---

## Genel Sorular

### [[SITE_NAME]] nedir?

[[SITE_NAME]], T3 Stack (Next.js, tRPC, Drizzle ORM, Better Auth) üzerine inşa edilmiş açık kaynaklı, yapay zeka ajan odaklı bir CMS ve SaaS başlangıç paketidir. Organizasyonlar, faturalandırma ve gerçek zamanlı bildirimler gibi SaaS bileşenleriyle birlikte eksiksiz bir içerik yönetim sistemi sunar.

### [[SITE_NAME]] kimin için tasarlanmıştır?

[[SITE_NAME]], SaaS ürünleri, pazarlama siteleri, bloglar veya içerik odaklı uygulamalar geliştiren geliştiriciler ve ekipler için tasarlanmıştır. Özellikle yapay zeka destekli geliştirme iş akışlarından yararlanan projeler için uygundur.

### [[SITE_NAME]] ücretsiz midir?

Evet. [[SITE_NAME]], AGPL-3.0 lisansı altında açık kaynaklıdır. Herhangi bir proje için serbestçe kullanabilirsiniz. AGPL gereksinimlerinden bağımsız tescilli dağıtım ihtiyacınız varsa ticari lisanslar mevcuttur.

## Teknik Sorular

### [[SITE_NAME]] hangi teknoloji yığınını kullanır?

[[SITE_NAME]]; Next.js 16 (App Router), TypeScript, Tailwind CSS v4, tRPC, Drizzle ORM, PostgreSQL ve Better Auth ile geliştirilmiştir. Ayrıca önbelleğe alma ve hız sınırlama için Redis, arka plan görevleri için BullMQ ve gerçek zamanlı özellikler için WebSocket desteği sunmaktadır.

### [[SITE_NAME]] nasıl dağıtılır?

[[SITE_NAME]], Node.js desteği olan herhangi bir ortamda dağıtılabilir. Popüler seçenekler arasında Vercel, Railway, Fly.io ve Docker destekli herhangi bir VPS bulunmaktadır. Bir PostgreSQL veritabanı ve tam işlevsellik için isteğe bağlı olarak Redis gereklidir.

### Tasarımı özelleştirebilir miyim?

Kesinlikle. [[SITE_NAME]], Tailwind CSS v4 ile birlikte OKLCH tasarım token sistemi kullanmaktadır. Renk tonu, parlaklık ve kroma değerleri için birkaç CSS özel özelliğini değiştirerek uygulamanın tamamını yeniden markalaştırabilirsiniz.

## İçerik Yönetimi

### Hangi içerik türleri desteklenir?

Varsayılan olarak [[SITE_NAME]]; sayfaları, blog yazılarını, portföy öğelerini, vitrin kartlarını, kategorileri ve etiketleri destekler. İçerik türü kaydı yapılandırma odaklıdır, bu nedenle yeni türler eklemek minimum düzeyde kod değişikliği gerektirir.

### [[SITE_NAME]] birden fazla dili destekler mi?

Evet. [[SITE_NAME]], proxy-rewrite yerel ayar yönlendirmesi, içerik için çeviri grupları ve yönetim panelinde çeviri çubuğu ile yerleşik i18n desteğine sahiptir. Tek bir yapılandırma dizisini güncelleyerek yeni yerel ayarlar ekleyebilirsiniz.

### Zengin metin editörü kullanabilir miyim?

Evet. Yönetim paneli; başlıklar, listeler, görseller, bağlantılar, kod blokları ve özel kısa kodlar desteğiyle Tiptap tabanlı bir zengin metin editörü içermektedir. İçerik, taşınabilirlik için Markdown formatında saklanmaktadır.
