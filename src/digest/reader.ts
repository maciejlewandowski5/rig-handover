import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestNight, DigestRow, DigestStatusCounts, RunStatus } from './types.js';

type RunEvent = {
  at: string;
  job: string;
  status: RunStatus;
  owner: string | null | undefined;
  error: string | undefined;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseRunEvent(line: string): RunEvent | null {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }

  if (!isRecord(value)) return null;
  if (typeof value.at !== 'string' || !Number.isFinite(Date.parse(value.at))) return null;
  if (typeof value.job !== 'string' || value.job.length === 0) return null;
  if (value.status !== 'ok' && value.status !== 'retry' && value.status !== 'fail') return null;
  if ('owner' in value && value.owner !== null && typeof value.owner !== 'string') return null;
  if ('error' in value && typeof value.error !== 'string') return null;

  return {
    at: value.at,
    job: value.job,
    status: value.status,
    owner: 'owner' in value ? value.owner as string | null : undefined,
    error: 'error' in value ? value.error as string : undefined,
  };
}

export function readNight(runsDir: string, night: string): DigestNight | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(night)) return null;

  let contents: string;
  try {
    contents = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }

  const rowsByJob = new Map<string, DigestRow>();
  let badLines = 0;
  const lines = contents.split(/\r?\n/);
  if (lines.at(-1) === '') lines.pop();

  for (const line of lines) {
    const event = parseRunEvent(line);
    if (!event) {
      badLines += 1;
      continue;
    }

    const previous = rowsByJob.get(event.job);
    rowsByJob.set(event.job, {
      job: event.job,
      owner: event.owner === undefined ? previous?.owner ?? null : event.owner,
      runs: (previous?.runs ?? 0) + 1,
      retries: (previous?.retries ?? 0) + (event.status === 'retry' ? 1 : 0),
      lastStatus: event.status,
      lastError: event.error === undefined ? previous?.lastError ?? null : event.error,
      firstAt: previous?.firstAt ?? event.at,
      lastAt: event.at,
    });
  }

  const rows = [...rowsByJob.values()].sort((a, b) => a.job < b.job ? -1 : a.job > b.job ? 1 : 0);
  return { night, rows, badLines };
}

export function digestStatusCounts(rows: DigestRow[]): DigestStatusCounts {
  const counts: DigestStatusCounts = { ok: 0, retry: 0, fail: 0 };
  for (const row of rows) counts[row.lastStatus] += 1;
  return counts;
}
