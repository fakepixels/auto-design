import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { expect, it } from 'vitest';
import { runOnboard } from '../src/onboard/server.js';

it('offline refine respects less rounded and less warm instead of reversing them', async () => {
  const { server } = await runOnboard({ port: 0, open: false });
  const post = (request: string): Promise<any> => new Promise((resolve, reject) => {
    const req = Object.assign(Readable.from([Buffer.from(JSON.stringify({ request }))]), { method: 'POST', url: '/api/refine', headers: { host: 'localhost', 'content-type': 'application/json' } }) as IncomingMessage;
    let status = 0;
    const res = { writeHead(code: number) { status = code; return this; }, end(data: string) { if (status !== 200) reject(new Error(`${status}: ${data}`)); else resolve(JSON.parse(data)); return this; } } as unknown as ServerResponse;
    server.emit('request', req, res);
  });
  try {
    const first = await post('less rounded');
    expect(first.choices.radius).toBe(5);
    expect(first.changes).toContain('Corners: 8px → 5px');
    const second = await post('less warm');
    expect(second.choices.neutral).toBe('cool');
    expect(second.choices.warmth).toBeCloseTo(0.1);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
  }
});