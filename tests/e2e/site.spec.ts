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
  for (const [time, segment] of [[5, 'b'], [14, 'a'], [25, 'c'], [1, 'intro']] as const) {
    await page.locator('.hero-video').evaluate((video, t) => {
      Object.defineProperty(video, 'currentTime', { get: () => t, configurable: true });
      video.dispatchEvent(new Event('timeupdate'));
    }, time);
    await expect(title).toHaveText(en.hero[segment].title);
    await expect(page.locator('.hero-subtitle')).toHaveText(en.hero[segment].subtitle);
  }
  expect(errors).toEqual([]);
});

test.describe('on a portrait phone', () => {
  test.use({ viewport: { width: 375, height: 800 } });

  test('the hero picks the tall video', async ({ page }) => {
    await page.goto(base);
    const sources = await page.locator('.hero-video source').evaluateAll((all) => all.map((s) => s.getAttribute('src')));
    expect(sources).toEqual(['/media/hero-tall.webm', '/media/hero-tall.mp4']);
    await expect(page.locator('.hero-video')).toHaveAttribute('poster', '/media/hero-tall-poster.webp');
  });
});

test('a wide window picks the wide video', async ({ page }) => {
  await page.goto(base);
  await expect(page.locator('.hero-video source').first()).toHaveAttribute('src', '/media/hero-wide.webm');
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
