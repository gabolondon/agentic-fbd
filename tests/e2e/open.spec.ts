import { spawn, type ChildProcess } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const root = resolve(import.meta.dirname, '../..');
const cli = join(root, 'dist/cli.mjs');
const examples = join(root, 'skills/logic-builder/examples');

interface Opened {
  url: string;
  file: string;
  child: ChildProcess;
}

/** Copies a file to a temp dir and runs `logic-builder open` on it. */
async function open(source: string | null, contents?: string): Promise<Opened> {
  const dir = mkdtempSync(join(tmpdir(), 'lb-e2e-'));
  const file = join(dir, 'subject.logic.json');
  if (source) copyFileSync(source, file);
  else writeFileSync(file, contents ?? '');
  const child = spawn(process.execPath, [cli, 'open', file, '--no-open'], { stdio: ['ignore', 'pipe', 'pipe'] });
  const url = await new Promise<string>((done, fail) => {
    let out = '';
    child.stdout!.on('data', (chunk) => {
      out += String(chunk);
      const match = /logic-builder: (http:\/\/127\.0\.0\.1:\d+\/)/.exec(out);
      if (match) done(match[1]!);
    });
    child.stderr!.on('data', (chunk) => fail(new Error(String(chunk))));
    child.on('exit', (code) => fail(new Error(`open exited with ${code}`)));
  });
  return { url, file, child };
}

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return errors;
}

const rendered = (page: Page) => page.locator('.react-flow__node');

test('renders the design example with no console errors', async ({ page }) => {
  const opened = await open(join(examples, 'other-free-text.logic.json'));
  const errors = trackErrors(page);
  try {
    await page.goto(opened.url);
    await expect(rendered(page).filter({ hasText: 'Other: add vaccine' })).toBeVisible();
    // The subject's focus opens the vaccinations step first.
    await expect(page).toHaveURL(/#\/vaccines$/);
    await page.getByRole('button', { name: 'Before' }).click();
    await expect(rendered(page).filter({ hasText: "Type in 'Other'" })).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally {
    opened.child.kill();
  }
});

test('renders the understand example and its unexplored panel', async ({ page }) => {
  const opened = await open(join(examples, 'auth-gate.logic.json'));
  const errors = trackErrors(page);
  try {
    await page.goto(opened.url);
    await rendered(page).filter({ hasText: 'Authorization' }).first().dblclick();
    await expect(page.getByText('Copy request for Claude')).toBeVisible();
    await expect(page.locator('.lb-request')).toContainText('Explain "Authorization" (authz)');
    expect(errors).toEqual([]);
  } finally {
    opened.child.kill();
  }
});

test('updates the view in place when the file changes', async ({ page }) => {
  const opened = await open(join(examples, 'auth-gate.logic.json'));
  try {
    await page.goto(opened.url);
    await expect(rendered(page).filter({ hasText: 'Forward or deny' })).toBeVisible();
    await page.evaluate(() => ((window as unknown as { marker: number }).marker = 42));

    const doc = JSON.parse(readFileSync(opened.file, 'utf8'));
    doc.nodes.find((n: { id: string }) => n.id === 'proxy').label = 'Forward, deny or log';
    writeFileSync(opened.file, JSON.stringify(doc, null, 2));

    await expect(rendered(page).filter({ hasText: 'Forward, deny or log' })).toBeVisible();
    // Same page: no full reload happened.
    expect(await page.evaluate(() => (window as unknown as { marker?: number }).marker)).toBe(42);
  } finally {
    opened.child.kill();
  }
});

test('shows validation errors and keeps the last good render', async ({ page }) => {
  const opened = await open(join(examples, 'auth-gate.logic.json'));
  try {
    await page.goto(opened.url);
    await expect(rendered(page).filter({ hasText: 'Forward or deny' })).toBeVisible();

    const doc = JSON.parse(readFileSync(opened.file, 'utf8'));
    doc.wires[0].to = 'verify.missing';
    writeFileSync(opened.file, JSON.stringify(doc, null, 2));

    await expect(page.getByRole('alert')).toContainText('has no input "missing"');
    await expect(page.getByRole('alert')).toContainText('showing the last valid version');
    await expect(rendered(page).filter({ hasText: 'Forward or deny' })).toBeVisible();
  } finally {
    opened.child.kill();
  }
});

test('opens an invalid file and explains why', async ({ page }) => {
  const opened = await open(null, '{ "version": "0.1" ');
  try {
    await page.goto(opened.url);
    await expect(page.getByRole('alert')).toContainText('invalid JSON');
  } finally {
    opened.child.kill();
  }
});

test('lists the diagrams in the folder and follows a link to another one', async ({ page }) => {
  const doc = JSON.parse(readFileSync(join(examples, 'auth-gate.logic.json'), 'utf8'));
  const provider = doc.nodes.find((n: { id: string }) => n.id === 'provider');
  provider.see = 'identity.logic.json#issue';
  const opened = await open(null, JSON.stringify(doc));
  writeFileSync(
    join(opened.file, '../identity.logic.json'),
    JSON.stringify({
      version: '0.1',
      subject: { id: 'identity', title: 'Identity provider: issuing sessions', intent: 'Linked diagram', mode: 'understand' },
      nodes: [
        { id: 't-login', kind: 'trigger', source: 'user', label: 'User signs in', desc: 'The user submits the sign-in form.', outputs: { creds: 'string' } },
        { id: 'issue', kind: 'function', label: 'Issue session', desc: 'Creates a session for valid credentials.', logic: ['Check the credentials.', 'Sign a session token.'], inputs: { creds: 'string' } },
      ],
      wires: [{ id: 'w1', from: 't-login.creds', to: 'issue.creds' }],
    }),
  );
  const errors = trackErrors(page);
  try {
    await page.goto(opened.url);
    await expect(page.locator('.lb-file')).toHaveCount(2);
    await rendered(page).filter({ hasText: 'Identity provider' }).first().click();
    await page.getByRole('button', { name: /Open identity\.logic\.json › issue/ }).click();
    await expect(rendered(page).filter({ hasText: 'User signs in' })).toBeVisible();
    await expect(page).toHaveURL(/file=identity\.logic\.json/);
    await expect(page.locator('.lb-panel h3')).toHaveText('Issue session');
    expect(errors).toEqual([]);
  } finally {
    opened.child.kill();
  }
});
