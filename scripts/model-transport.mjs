import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Test-only model GET transport for cloud runners. Uses the configured HTTPS proxy
// and normal curl TLS validation; document contents never enter these requests.
export async function cloudModelTransport(context) {
  let count = 0;
  if (process.env.HTTPS_PROXY || process.env.https_proxy) {
    const execute = promisify(execFile);
    await context.route(/^https:\/\/(huggingface\.co|[^/]+\.hf\.co|[^/]+\.xethub\.hf\.co)\//, async route => {
      if (route.request().method() !== 'GET') throw new Error('Unexpected external request method');
      const directory = await mkdtemp(join(tmpdir(), 'entrelinhas-model-get-'));
      try {
        await execute('curl', ['--silent', '--show-error', '--location', '--max-time', '300', '-D', join(directory, 'headers'), '-o', join(directory, 'body'), route.request().url()], { timeout: 310000 });
        const headers = await readFile(join(directory, 'headers'), 'utf8');
        const statuses = [...headers.matchAll(/^HTTP\/[^\s]+\s+(\d+)/gm)];
        const status = Number(statuses.at(-1)?.[1] || 502);
        const body = await readFile(join(directory, 'body'));
        const contentType = [...headers.matchAll(/^content-type:\s*(.+)$/gim)].at(-1)?.[1].trim() || 'application/octet-stream';
        count++;
        if (status >= 400) console.log(`Model GET returned ${status}.`);
        await route.fulfill({ status, body, headers: { 'content-type': contentType, 'access-control-allow-origin': '*' } });
      } catch { await route.abort('failed'); }
      finally { await rm(directory, { recursive: true, force: true }); }
    });
  }
  return () => count;
}
