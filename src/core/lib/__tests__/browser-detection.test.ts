import {
  detectInAppBrowser,
  detectMobilePlatform,
  getOpenInBrowserUrl,
  isBotUserAgent,
  isInAppBrowser,
} from '../browser-detection';
import { describe, expect, it } from 'vitest';

const UA = {
  chromeAndroid:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
  safariIos:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
  fbIos:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/450.0.0.38.108;FBBV/564431176;FBDV/iPhone15,2;FBMD/iPhone;FBSN/iOS;FBSV/17.4;FBSS/3;FBID/phone;FBLC/en_US;FBOP/5]',
  fbAndroid:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/UQ1A.240205.004; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/123.0.6312.80 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/455.0.0.38.109;]',
  messengerIos:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/MessengerForiOS;FBAV/450.0.0.38.108;FBBV/564431176;FBDV/iPhone15,2;FBMD/iPhone;FBSN/iOS;FBSV/17.4;FBSS/3;FBID/phone;FBLC/en_US;FBOP/5]',
  messengerAndroid:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/UQ1A.240205.004; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/123.0.6312.80 Mobile Safari/537.36 [FB_IAB/Orca-Android;FBAV/455.0.0.38.109;]',
  instagram:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 325.0.0.35.91 (iPhone15,2; iOS 17_4; en_US; en; scale=3.00; 1179x2556; 578112567)',
  tiktok:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/UQ1A.240205.004; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/123.0.6312.80 Mobile Safari/537.36 trill_2022603030 JsSdk/1.0 NetType/WIFI Channel/googleplay AppName/musical_ly app_version/34.0.0 ByteLocale/en Region/US',
  linkedin:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [LinkedInApp]/9.29.1234',
  googlebot:
    'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Googlebot/2.1; +http://www.google.com/bot.html) Chrome/124.0.0.0 Safari/537.36',
  fbPreview:
    'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
  lighthouse:
    'Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36 Chrome-Lighthouse',
  inspection:
    'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36 (compatible; Google-InspectionTool/1.0)',
};

describe('detectInAppBrowser', () => {
  it.each([
    ['fbIos', 'facebook'],
    ['fbAndroid', 'facebook'],
    ['messengerIos', 'messenger'],
    ['messengerAndroid', 'messenger'],
    ['instagram', 'instagram'],
    ['tiktok', 'tiktok'],
    ['linkedin', 'linkedin'],
  ] as const)('%s → %s', (key, expected) => {
    expect(detectInAppBrowser(UA[key])).toBe(expected);
    expect(isInAppBrowser(UA[key])).toBe(true);
  });

  it('returns null for regular browsers, link-preview bots and empty input', () => {
    expect(detectInAppBrowser(UA.chromeAndroid)).toBeNull();
    expect(detectInAppBrowser(UA.safariIos)).toBeNull();
    // facebookexternalhit is the share-preview crawler, not a webview.
    expect(detectInAppBrowser(UA.fbPreview)).toBeNull();
    expect(detectInAppBrowser('')).toBeNull();
    expect(detectInAppBrowser(null)).toBeNull();
    expect(isInAppBrowser(undefined)).toBe(false);
  });
});

describe('detectMobilePlatform', () => {
  it('classifies iOS, Android and everything else', () => {
    expect(detectMobilePlatform(UA.fbIos)).toBe('ios');
    expect(detectMobilePlatform(UA.fbAndroid)).toBe('android');
    expect(
      detectMobilePlatform('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')
    ).toBe('other');
    expect(detectMobilePlatform(null)).toBe('other');
  });
});

describe('getOpenInBrowserUrl', () => {
  it('builds an Android intent URL that preserves path and query', () => {
    expect(
      getOpenInBrowserUrl(
        UA.fbAndroid,
        'https://example.com/login?next=%2Faccount'
      )
    ).toBe(
      'intent://example.com/login?next=%2Faccount#Intent;scheme=https;end'
    );
  });

  it('returns null on iOS (no intent scheme) and for non-http hrefs', () => {
    expect(getOpenInBrowserUrl(UA.fbIos, 'https://example.com/')).toBeNull();
    expect(getOpenInBrowserUrl(UA.fbAndroid, 'about:blank')).toBeNull();
  });
});

describe('isBotUserAgent', () => {
  it('matches crawlers, preview fetchers and headless tooling', () => {
    expect(isBotUserAgent(UA.googlebot)).toBe(true);
    expect(isBotUserAgent(UA.fbPreview)).toBe(true);
    expect(isBotUserAgent(UA.lighthouse)).toBe(true);
    expect(isBotUserAgent(UA.inspection)).toBe(true);
    expect(
      isBotUserAgent('Mozilla/5.0 (X11; Linux x86_64) HeadlessChrome/124.0')
    ).toBe(true);
  });

  it('does not flag real browsers or in-app webviews', () => {
    expect(isBotUserAgent(UA.chromeAndroid)).toBe(false);
    expect(isBotUserAgent(UA.safariIos)).toBe(false);
    expect(isBotUserAgent(UA.fbIos)).toBe(false);
    expect(isBotUserAgent(UA.instagram)).toBe(false);
    expect(isBotUserAgent(null)).toBe(false);
    expect(isBotUserAgent('')).toBe(false);
  });
});
