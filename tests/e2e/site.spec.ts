import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { extname, join, normalize, resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import en from '../../site/src/i18n/en.json' with { type: 'json' };
import es from '../../site/src/i18n/es.json' with { type: 'json' };

// The website, built with `npm run build:site`, served the way GitHub Pages serves it.
const siteDist = resolve(import.meta.dirname, '../../site/dist');

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.webm': 'video/webm',
  '.mp4': 'video/mp4',
};

let server: Server;
let base: string;

test.beforeAll(async () => {
  if (!existsSync(join(siteDist, 'index.html'))) throw new Error('Run `npm run build:site` first.');
  server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
    let file = normalize(join(siteDist, path));
    if (file.startsWith(siteDist) && existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
    if (!file.startsWith(siteDist) || !existsSync(file)) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    createReadStream(file).pipe(res);
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
});

test.afterAll(() => new Promise<void>((done) => server.close(() => done())));

/** Page errors and console errors, except media that a clean checkout doesn't have. */
function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.location().url.includes('/media/')) errors.push(m.text());
  });
  return errors;
}

test('the site loads in English with no errors', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto(base);
  await expect(page.locator('.wordmark')).toHaveText('agentic-fbd');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByText(en.footer.madeBy)).toBeVisible();
  expect(errors).toEqual([]);
});

test.describe('in a Spanish browser', () => {
  test.use({ locale: 'es-ES' });

  test('it gets Spanish, and EN sticks after a reload', async ({ page }) => {
    await page.goto(base);
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
    await expect(page.getByText(es.footer.madeBy)).toBeVisible();
    await page.locator('.topbar').getByRole('button', { name: 'EN', exact: true }).click();
    await expect(page.getByText(en.footer.madeBy)).toBeVisible();
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('.footer').getByRole('button', { name: 'EN', exact: true })).toHaveAttribute('aria-pressed', 'true');
  });
});

test('blocked storage still renders and switches language', async ({ page }) => {
  const errors = trackErrors(page);
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new DOMException('blocked', 'SecurityError');
      },
    });
  });
  await page.goto(base);
  await page.locator('.topbar').getByRole('button', { name: 'ES', exact: true }).click();
  await expect(page.getByText(es.footer.madeBy)).toBeVisible();
  expect(errors).toEqual([]);
});

test('the menu opens with the section links and closes on Escape', async ({ page }) => {
  await page.goto(base);
  await page.getByRole('button', { name: en.nav.menu }).click();
  await expect(page.locator('#menu a')).toHaveText([en.nav.features, en.nav.example, en.nav.install, /GitHub/]);
  await page.keyboard.press('Escape');
  await expect(page.locator('#menu')).toHaveCount(0);
});

test('hero titles follow the video', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto(base);
  const title = page.locator('.hero-title');
  await expect(title).toHaveText(en.hero.intro.title);
  for (const [time, segment] of [[5, 'b'], [17, 'a'], [30, 'c'], [1, 'intro']] as const) {
    await page.locator('.hero-video').evaluate((video, t) => {
      Object.defineProperty(video, 'currentTime', { get: () => t, configurable: true });
      video.dispatchEvent(new Event('timeupdate'));
    }, time);
    await expect(title).toHaveText(en.hero[segment].title);
    await expect(page.locator('.hero-subtitle')).toHaveText(en.hero[segment].subtitle);
  }
  expect(errors).toEqual([]);
});

test('the video holds on the intro for 5 s, still showing Pause', async ({ page }) => {
  await page.clock.install();
  await page.goto(base);
  const video = page.locator('.hero-video');
  // Stubbed time and play(): what matters is when the hook pauses and resumes, not the media.
  await video.evaluate((v: HTMLVideoElement & { plays?: number }) => {
    v.plays = 0;
    v.play = () => ((v.plays! += 1), Promise.resolve());
  });
  for (const time of [2.1, 2.25]) {
    await video.evaluate((v, t) => {
      Object.defineProperty(v, 'currentTime', { get: () => t, configurable: true });
      v.dispatchEvent(new Event('timeupdate'));
    }, time);
  }
  await expect(page.locator('.hero-title')).toHaveText(en.hero.intro.title);
  await expect(page.getByRole('button', { name: en.hero.pause })).toBeVisible();
  const plays = () => video.evaluate((v: HTMLVideoElement & { plays?: number }) => v.plays);
  await page.clock.runFor(4900);
  expect(await plays()).toBe(0);
  await page.clock.runFor(200);
  expect(await plays()).toBe(1);
  // After the resume the video sits on the hold point again; it doesn't hold twice in a loop.
  const paused = () => video.evaluate((v: HTMLVideoElement & { pauses?: number }) => v.pauses);
  await video.evaluate((v: HTMLVideoElement & { pauses?: number }) => {
    v.pauses = 0;
    v.pause = () => void (v.pauses! += 1);
  });
  for (const time of [2.19, 2.24]) {
    await video.evaluate((v, t) => {
      Object.defineProperty(v, 'currentTime', { get: () => t, configurable: true });
      v.dispatchEvent(new Event('timeupdate'));
    }, time);
  }
  expect(await paused()).toBe(0);
});

test.describe('on a portrait phone', () => {
  test.use({ viewport: { width: 375, height: 800 } });

  test('the hero picks the tall video', async ({ page }) => {
    await page.goto(base);
    const sources = await page.locator('.hero-video source').evaluateAll((all) => all.map((s) => s.getAttribute('src')));
    expect(sources).toEqual(['/media/hero-tall-en.webm', '/media/hero-tall-en.mp4']);
    await expect(page.locator('.hero-video')).toHaveAttribute('poster', '/media/hero-tall-poster.webp');
  });
});

test('a wide window picks the wide video', async ({ page }) => {
  await page.goto(base);
  await expect(page.locator('.hero-video source').first()).toHaveAttribute('src', '/media/hero-wide-en.webm');
});

test('switching to Spanish swaps in the Spanish video', async ({ page }) => {
  await page.goto(base);
  await page.locator('.topbar').getByRole('button', { name: 'ES', exact: true }).click();
  const sources = await page.locator('.hero-video source').evaluateAll((all) => all.map((s) => s.getAttribute('src')));
  expect(sources).toEqual(['/media/hero-wide-es.webm', '/media/hero-wide-es.mp4']);
  await expect(page.locator('.hero-video')).toHaveAttribute('poster', '/media/hero-wide-poster.webp');
});

test.describe('with reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('the video does not autoplay and offers Play', async ({ page }) => {
    await page.goto(base);
    await expect(page.getByRole('button', { name: en.hero.play })).toBeVisible();
    expect(await page.locator('.hero-video').evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
    await expect(page.locator('.hero-title')).toHaveText(en.hero.intro.title);
  });
});

test('without media the hero keeps its titles and hides the pause button', async ({ page }) => {
  const errors = trackErrors(page);
  await page.route('**/media/**', (route) => route.fulfill({ status: 404 }));
  await page.goto(base);
  await expect(page.locator('.hero-title')).toHaveText(en.hero.intro.title);
  await expect(page.locator('.hero-toggle')).toHaveCount(0);
  expect(errors).toEqual([]);
});

const FEATURES = ['understand-design', 'data-box', 'before-after', 'code-locations', 'edit-copy', 'living-docs'];

test('sections come in the approved order', async ({ page }) => {
  await page.goto(base);
  const ids = await page.locator('main section[id]').evaluateAll((all) => all.map((s) => s.id));
  expect(ids).toEqual(['hero', 'statement', 'features', 'example', 'install']);
  expect(await page.locator('#features article').evaluateAll((all) => all.map((a) => a.id))).toEqual(FEATURES);
  await expect(page.locator('#features article h3')).toHaveText(FEATURES.map((id) => en.features[id as keyof typeof en.features] as { title: string }).map((f) => f.title));
});

test('install shows the two commands, each with a copy button', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto(base);
  const rows = page.locator('#install .command');
  await expect(rows.locator('code')).toHaveText(['/plugin marketplace add gabolondon/agentic-fbd', '/plugin install agentic-fbd@agentic-fbd']);
  await rows.nth(1).getByRole('button', { name: en.install.copy }).click();
  await expect(rows.nth(1).getByRole('button')).toHaveText(en.install.copied);
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('/plugin install agentic-fbd@agentic-fbd');
  await expect(page.locator('#install').getByRole('link', { name: /View on GitHub/ })).toHaveAttribute('href', 'https://github.com/gabolondon/agentic-fbd');
});

for (const locale of ['en-US', 'es-ES']) {
  test.describe(`at phone width (${locale})`, () => {
    test.use({ viewport: { width: 375, height: 800 }, locale });

    test('no horizontal scroll, display type at least 40px, every image loaded', async ({ page }) => {
      const errors = trackErrors(page);
      await page.goto(base);
      for (const img of await page.locator('img').all()) {
        await img.scrollIntoViewIfNeeded();
        await expect(img).toHaveJSProperty('complete', true);
        expect(await img.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(0);
        // Content images describe themselves; a decorative one is hidden from screen readers.
        if ((await img.getAttribute('aria-hidden')) === 'true') expect(await img.getAttribute('alt')).toBe('');
        else expect(await img.getAttribute('alt')).toBeTruthy();
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
      const small = await page.evaluate(() =>
        [...document.querySelectorAll('body *')]
          .filter((el) => getComputedStyle(el).fontFamily.startsWith('Anton') && el.textContent?.trim())
          .filter((el) => parseFloat(getComputedStyle(el).fontSize) < 40)
          .map((el) => `${el.tagName}.${el.className}: ${getComputedStyle(el).fontSize}`),
      );
      expect(small).toEqual([]);
      expect(errors).toEqual([]);
    });
  });
}
