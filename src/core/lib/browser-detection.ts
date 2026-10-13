/**
 * User-agent sniffing, limited to the two things it is still the only tool for:
 *
 * - In-app webviews (Facebook, Instagram, Messenger, TikTok, LinkedIn) block
 *   Google OAuth (`disallowed_useragent`), so social sign-in silently fails
 *   there — the only fix is getting the user into a real browser.
 * - Crawlers / link-preview fetchers, so consent and analytics can stay quiet
 *   for them.
 *
 * Pure functions over a UA string: usable from the client (`navigator.userAgent`),
 * route handlers and server components alike.
 */

export type InAppBrowser =
  'facebook' | 'messenger' | 'instagram' | 'tiktok' | 'linkedin';

export type MobilePlatform = 'ios' | 'android' | 'other';

// Order matters: Messenger UAs also carry FBAN/FBAV, so check it first.
const IN_APP_MATCHERS: ReadonlyArray<readonly [InAppBrowser, RegExp]> = [
  ['messenger', /\bmessengerforios\b|\borca-android\b|\bmessenger\b/],
  ['facebook', /\bfban\b|\bfbav\b|\bfb_iab\b|\bfbios\b|\bfb4a\b/],
  ['instagram', /\binstagram\b|\big_/],
  ['tiktok', /\bmusical_ly\b|\btiktok\b|\bbytedancewebview\b|\bbytelocale\b/],
  ['linkedin', /\blinkedinapp\b/],
];

/** Which in-app webview the UA belongs to, or null for a regular browser. */
export function detectInAppBrowser(
  ua: string | null | undefined
): InAppBrowser | null {
  if (!ua) return null;
  const lower = ua.toLowerCase();
  for (const [name, re] of IN_APP_MATCHERS) {
    if (re.test(lower)) return name;
  }
  return null;
}

export function isInAppBrowser(ua: string | null | undefined): boolean {
  return detectInAppBrowser(ua) !== null;
}

export function detectMobilePlatform(
  ua: string | null | undefined
): MobilePlatform {
  if (!ua) return 'other';
  const lower = ua.toLowerCase();
  if (/iphone|ipad|ipod/.test(lower)) return 'ios';
  if (/android/.test(lower)) return 'android';
  return 'other';
}

/**
 * URL that asks Android to hand the page to the default browser (Chrome
 * intent scheme). iOS has no equivalent — the webview owns the navigation —
 * so callers show "tap ··· → Open in browser" guidance there instead.
 */
export function getOpenInBrowserUrl(
  ua: string | null | undefined,
  href: string
): string | null {
  if (detectMobilePlatform(ua) !== 'android') return null;
  const match = /^(https?):\/\/(.+)$/i.exec(href);
  if (!match) return null;
  const [, scheme, rest] = match;
  return `intent://${rest}#Intent;scheme=${scheme.toLowerCase()};end`;
}

// Google-prefixed UAs without "bot" must be listed explicitly:
//   google-inspectiontool  Search Console URL Inspection "Live Test"
//   google-extended        Gemini training opt-out crawler
//   google-read-aloud      accessibility / TTS fetcher
//   mediapartners-google   AdSense
const BOT_UA_REGEX =
  /bot|crawler|spider|crawling|googlebot|google-inspectiontool|google-extended|google-read-aloud|mediapartners-google|bingbot|slurp|duckduckbot|baiduspider|yandexbot|facebookexternalhit|twitterbot|rogerbot|linkedinbot|embedly|quora link preview|showyoubot|outbrain|pinterest|slackbot|vkshare|w3c_validator|whatsapp|telegrambot|applebot|flipboard|tumblr|bitlybot|skypeuripreview|nuzzel|discordbot|qwantify|pinterestbot|bitrix link preview|xing-contenttabreceiver|chrome-lighthouse|headlesschrome|phantomjs|slimerjs|selenium|webdriver|prerender/;

/** Crawler, link-preview or headless-automation UA. */
export function isBotUserAgent(ua: string | null | undefined): boolean {
  if (!ua) return false;
  return BOT_UA_REGEX.test(ua.toLowerCase());
}
