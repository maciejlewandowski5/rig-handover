import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { readNight } from '../src/digest/reader.js';

const baseConfig = {
  adapter: 'shim',
  installed: '2026-10-29T14:06:00+01:00',
  beatEverySeconds: 60,
};

const temporaryDirectories: string[] = [];

function makeRunsDir() {
  const dir = mkdtempSync(join(tmpdir(), 'rig-digest-'));
  temporaryDirectories.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of temporaryDirectories.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('run log reader', () => {
  it('groups the sample night, keeps the null owner, and counts its malformed line', () => {
    const digest = readNight('runs', '2026-10-28');

    expect(digest).not.toBeNull();
    expect(digest?.rows).toHaveLength(5);
    expect(digest?.badLines).toBe(1);
    expect(digest?.rows.map((row) => row.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
    expect(digest?.rows.find((row) => row.job === 'digest/render')?.owner).toBeNull();
    expect(digest?.rows.find((row) => row.job === 'fixtures/refresh')).toMatchObject({
      runs: 4,
      retries: 3,
      lastStatus: 'ok',
      lastError: 'upstream 503',
    });
  });
});

describe('digest routes', () => {
  it('renders the digest and returns the same sorted rows as JSON', async () => {
    const app = createApp({ ...baseConfig, runsDir: 'runs' });
    const [page, api] = await Promise.all([
      app.request('/digest/2026-10-28'),
      app.request('/api/digest/2026-10-28'),
    ]);
    const html = await page.text();
    const json = await api.json();

    expect(page.status).toBe(200);
    expect(api.status).toBe(200);
    expect(html).toContain('morning digest');
    expect(html).toContain('malformed line skipped');
    expect((json as { rows: Array<{ job: string }> }).rows.map((row) => row.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
  });

  it('returns 404 when a night has no file', async () => {
    const app = createApp({ ...baseConfig, runsDir: makeRunsDir() });
    const [page, api] = await Promise.all([
      app.request('/digest/2026-10-28'),
      app.request('/api/digest/2026-10-28'),
    ]);

    expect(page.status).toBe(404);
    expect(api.status).toBe(404);
  });

  it('renders an empty file as nothing ran', async () => {
    const runsDir = makeRunsDir();
    writeFileSync(join(runsDir, '2026-10-28.jsonl'), '');
    const app = createApp({ ...baseConfig, runsDir });
    const page = await app.request('/digest/2026-10-28');
    const api = await app.request('/api/digest/2026-10-28');
    const html = await page.text();
    const json = await api.json();

    expect(page.status).toBe(200);
    expect(html).toContain('nothing ran');
    expect(json).toMatchObject({ rows: [], badLines: 0 });
  });

  it('counts bad lines without failing the page or JSON route', async () => {
    const runsDir = makeRunsDir();
    writeFileSync(
      join(runsDir, '2026-10-28.jsonl'),
      '{"at":"2026-10-28T08:00:00+01:00","job":"build","status":"ok","owner":null}\nnot-json\n',
    );
    const app = createApp({ ...baseConfig, runsDir });
    const [page, api] = await Promise.all([
      app.request('/digest/2026-10-28'),
      app.request('/api/digest/2026-10-28'),
    ]);
    const html = await page.text();
    const json = await api.json();

    expect(page.status).toBe(200);
    expect(api.status).toBe(200);
    expect(html).toContain('1 malformed line skipped');
    expect(json).toMatchObject({ badLines: 1, rows: [{ job: 'build', owner: null }] });
  });

  it('links each night on the board with its final status counts', async () => {
    const app = createApp({ ...baseConfig, runsDir: 'runs' });
    const html = await (await app.request('/')).text();

    expect(html).toContain('href="/digest/2026-10-28"');
    expect(html).toContain('4 ok / 0 retry / 1 fail');
    expect(html).toContain('href="/digest/2026-10-27"');
  });
});
