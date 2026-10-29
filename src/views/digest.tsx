import type { DigestNight } from '../digest/types.js';

export function DigestPage({ digest }: { digest: DigestNight }) {
  const counts = { ok: 0, retry: 0, fail: 0 };
  for (const row of digest.rows) counts[row.lastStatus] += 1;

  return (
    <>
      <h1>morning digest</h1>
      <p class="mute">
        {digest.night} · {digest.rows.length} jobs · {counts.ok} ok / {counts.retry} retry / {counts.fail} fail
      </p>
      {digest.badLines > 0 && (
        <p class="warn">{digest.badLines} malformed {digest.badLines === 1 ? 'line' : 'lines'} skipped</p>
      )}
      {digest.rows.length === 0 ? (
        <p class="mute">nothing ran</p>
      ) : (
        <div class="table-scroll">
          <table>
            <thead>
              <tr>
                <th>job</th>
                <th>owner</th>
                <th>runs</th>
                <th>retries</th>
                <th>last status</th>
                <th>last error</th>
                <th>first time</th>
                <th>last time</th>
              </tr>
            </thead>
            <tbody>
              {digest.rows.map((row) => {
                const warn = row.retries >= 3 || row.lastStatus === 'fail';
                return (
                  <tr class={warn ? 'warn' : undefined}>
                    <td>{row.job}</td>
                    <td>{row.owner ?? '—'}</td>
                    <td>{row.runs}</td>
                    <td>{row.retries}</td>
                    <td>{row.lastStatus}</td>
                    <td>{row.lastError ?? '—'}</td>
                    <td>{row.firstAt}</td>
                    <td>{row.lastAt}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
