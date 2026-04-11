import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { Geist, Geist_Mono } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getLocale } from 'next-intl/server';

import { TRPCProvider } from '@/lib/trpc/provider';
import { StructuredData } from '@/core/components/seo/StructuredData';
import { buildOrganizationJsonLd } from '@/core/lib/seo/json-ld';
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
    title: siteConfig.seo.title,
    description: siteConfig.seo.description,
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
        })} />
        <script
          nonce={nonce}
          dangerouslySetInnerHTML={{
            __html: `(function(){var p=location.pathname;var k=p.startsWith('/dashboard')?'indigo-theme-admin':'indigo-theme-public';var t=localStorage.getItem(k)||localStorage.getItem('indigo-theme');var d=t==='dark'||(t==='system')&&matchMedia('(prefers-color-scheme:dark)').matches;if(d)document.documentElement.classList.add('dark')})()`,
          }}
        />
      </head>
      <body>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <TRPCProvider>{children}</TRPCProvider>
          <WebVitals />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
