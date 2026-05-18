import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { Geist, Geist_Mono } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getLocale } from 'next-intl/server';

import { TRPCProvider } from '@/lib/trpc/provider';
import { ImperativeDialogProvider } from '@/core/components/overlays/ImperativeDialogProvider';
import { StructuredData } from '@/core/components/seo/StructuredData';
import { buildOrganizationJsonLd, buildWebSiteJsonLd } from '@/core/lib/seo/json-ld';
import { siteDefaults } from '@/config/site';
import { WebVitals } from '@/components/WebVitals';

import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

import { siteConfig } from '@/config/site';
import { DEFAULT_LOCALE } from '@/lib/constants';

export const metadata: Metadata = {
  title: siteConfig.seo.title,
  description: siteConfig.seo.description,
  metadataBase: new URL(siteConfig.url),
  openGraph: {
    type: 'website',
    siteName: siteConfig.name,
    title: siteConfig.seo.title,
    description: siteConfig.seo.description,
    locale: DEFAULT_LOCALE,
    ...(siteConfig.seo.defaultOgImage && {
      images: [{ url: siteConfig.seo.defaultOgImage, alt: siteConfig.name }],
    }),
  },
  twitter: {
    card: 'summary_large_image',
    ...(siteConfig.social.twitter ? { site: siteConfig.social.twitter } : {}),
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();
  const nonce = (await headers()).get('x-nonce') ?? undefined;

  return (
    <html
      lang={locale}
      className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      suppressHydrationWarning
    >
      <head>
        <StructuredData data={buildOrganizationJsonLd({
          name: siteConfig.name,
          url: siteConfig.url,
          description: siteConfig.seo.description,
          contactEmail: siteDefaults.contactEmail || undefined,
        })} />
        <StructuredData data={buildWebSiteJsonLd({
          name: siteConfig.name,
          url: siteConfig.url,
          description: siteConfig.seo.description,
        })} />
        <script
          nonce={nonce}
          dangerouslySetInnerHTML={{
            // No-flash pre-hydration theme — mirrors core/store/theme-store.ts.
            __html: `(function(){var p=location.pathname,dash=p.startsWith('/dashboard');var m=dash?['light','dark']:${JSON.stringify(siteConfig.theme.modes)};var sys=m.indexOf('light')>-1&&m.indexOf('dark')>-1;var s;if(m.length<=1){s=m[0]||'light'}else{var st=sys?m.concat(['system']):m;var k=dash?'indigo-theme-admin':'indigo-theme-public';var v=localStorage.getItem(k)||localStorage.getItem('indigo-theme');s=v&&st.indexOf(v)>-1?v:(sys?'system':m[0])}var d=s==='dark'||(s==='system'&&matchMedia('(prefers-color-scheme:dark)').matches);if(d)document.documentElement.classList.add('dark')})()`,
          }}
        />
      </head>
      <body>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <TRPCProvider>
            <ImperativeDialogProvider>{children}</ImperativeDialogProvider>
          </TRPCProvider>
          <WebVitals />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
