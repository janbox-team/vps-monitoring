import { NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { env } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const interval = url.searchParams.get('interval') ?? '15';

  const baseUrl = env.APP_URL.replace(/\/$/, '');

  const scriptPath = path.join(process.cwd(), 'public', 'install.sh');
  let template: string;
  try {
    template = await readFile(scriptPath, 'utf8');
  } catch {
    return new NextResponse('install.sh template missing on server', { status: 500 });
  }

  const rendered = template
    .replace(/\r\n/g, '\n')
    .replace(/__SERVER_URL__/g, baseUrl)
    .replace(/__INTERVAL__/g, String(Math.max(5, Number(interval) || 15)));

  return new NextResponse(rendered, {
    headers: {
      'Content-Type': 'text/x-shellscript; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}
