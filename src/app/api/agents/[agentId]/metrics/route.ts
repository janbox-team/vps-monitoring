import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { Metric } from '@/lib/models/Metric';
import { getSessionFromCookies } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RouteContext {
  params: { agentId: string };
}

export async function GET(req: Request, { params }: RouteContext) {
  const session = await getSessionFromCookies();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const range = url.searchParams.get('range') ?? '1h';

  const now = Date.now();
  let fromMs = now - 60 * 60 * 1000;
  if (range === '6h') fromMs = now - 6 * 60 * 60 * 1000;
  else if (range === '24h') fromMs = now - 24 * 60 * 60 * 1000;
  else if (range === '7d') fromMs = now - 7 * 24 * 60 * 60 * 1000;

  await connectDB();
  const rows = await Metric.find({
    agentId: params.agentId,
    ts: { $gte: new Date(fromMs) },
  })
    .sort({ ts: 1 })
    .limit(2000)
    .lean();

  const metrics = rows.map((m) => ({
    ts: m.ts,
    cpuPercent: m.cpuPercent,
    memUsedBytes: m.memUsedBytes,
    memTotalBytes: m.memTotalBytes,
    diskUsedBytes: m.diskUsedBytes,
    diskTotalBytes: m.diskTotalBytes,
    diskReadBps: m.diskReadBps,
    diskWriteBps: m.diskWriteBps,
    netRxBps: m.netRxBps,
    netTxBps: m.netTxBps,
    dockerCpuPercent: m.dockerCpuPercent,
    dockerMemUsedBytes: m.dockerMemUsedBytes,
    dockerNetRxBps: m.dockerNetRxBps,
    dockerNetTxBps: m.dockerNetTxBps,
    dockerContainerCount: m.dockerContainerCount,
    temperatureC: m.temperatureC,
    gpuUtilPercent: m.gpuUtilPercent,
    gpuMemUsedBytes: m.gpuMemUsedBytes,
    gpuMemTotalBytes: m.gpuMemTotalBytes,
    gpuPowerWatts: m.gpuPowerWatts,
    loadAvg1: m.loadAvg1,
    loadAvg5: m.loadAvg5,
    loadAvg15: m.loadAvg15,
  }));

  return NextResponse.json({ metrics });
}
