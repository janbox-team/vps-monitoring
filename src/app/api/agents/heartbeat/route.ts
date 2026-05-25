import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAppSettings } from '@/lib/app-settings';
import { connectDB } from '@/lib/db';
import { env } from '@/lib/env';
import { Agent } from '@/lib/models/Agent';
import { Metric } from '@/lib/models/Metric';
import { sendTelegramDisconnectIfNeeded, sendTelegramOverloadIfNeeded } from '@/lib/telegram-alerts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({
  agentId: z.string().min(1),
  token: z.string().min(1),
  status: z.enum(['heartbeat', 'shutdown']).default('heartbeat'),
  cpuPercent: z.number().min(0).max(100).default(0),
  loadAvg1: z.number().min(0).default(0),
  loadAvg5: z.number().min(0).default(0),
  loadAvg15: z.number().min(0).default(0),
  memUsedBytes: z.number().min(0).default(0),
  memTotalBytes: z.number().min(0).default(0),
  swapUsedBytes: z.number().min(0).default(0),
  swapTotalBytes: z.number().min(0).default(0),
  diskUsedBytes: z.number().min(0).default(0),
  diskTotalBytes: z.number().min(0).default(0),
  diskReadBps: z.number().min(0).default(0),
  diskWriteBps: z.number().min(0).default(0),
  netRxBytes: z.number().min(0).default(0),
  netTxBytes: z.number().min(0).default(0),
  netRxBps: z.number().min(0).default(0),
  netTxBps: z.number().min(0).default(0),
  dockerCpuPercent: z.number().min(0).default(0),
  dockerMemUsedBytes: z.number().min(0).default(0),
  dockerNetRxBps: z.number().min(0).default(0),
  dockerNetTxBps: z.number().min(0).default(0),
  dockerContainerCount: z.number().int().min(0).default(0),
  temperatureC: z.number().min(0).default(0),
  gpuUtilPercent: z.number().min(0).max(100).default(0),
  gpuMemUsedBytes: z.number().min(0).default(0),
  gpuMemTotalBytes: z.number().min(0).default(0),
  gpuPowerWatts: z.number().min(0).default(0),
  uptimeSeconds: z.number().min(0).default(0),
  processCount: z.number().int().min(0).default(0),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  }

  await connectDB();

  const agent = await Agent.findOne({
    agentId: parsed.data.agentId,
    token: parsed.data.token,
  });

  if (!agent) {
    return NextResponse.json({ error: 'Unknown agent or invalid token' }, { status: 401 });
  }

  const now = new Date();
  const previousLastSeenAt = agent.lastSeenAt;
  agent.lastSeenAt = now;

  if (parsed.data.status === 'shutdown') {
    const appSettings = await getAppSettings();
    const sent = await sendTelegramDisconnectIfNeeded(
      {
        agentId: agent.agentId,
        hostname: agent.hostname,
        label: agent.label,
        publicIp: agent.publicIp,
        lastSeenAt: previousLastSeenAt ?? now,
        lastTelegramOfflineAlertAt: agent.lastTelegramOfflineAlertAt,
      },
      appSettings,
      env.APP_URL,
      'shutdown'
    );
    if (sent) {
      agent.lastTelegramOfflineAlertAt = now;
    }
    await agent.save();
    return NextResponse.json({ ok: true });
  }

  await agent.save();

  await Metric.create({
    agentId: agent.agentId,
    ts: now,
    cpuPercent: parsed.data.cpuPercent,
    loadAvg1: parsed.data.loadAvg1,
    loadAvg5: parsed.data.loadAvg5,
    loadAvg15: parsed.data.loadAvg15,
    memUsedBytes: parsed.data.memUsedBytes,
    memTotalBytes: parsed.data.memTotalBytes,
    swapUsedBytes: parsed.data.swapUsedBytes,
    swapTotalBytes: parsed.data.swapTotalBytes,
    diskUsedBytes: parsed.data.diskUsedBytes,
    diskTotalBytes: parsed.data.diskTotalBytes,
    diskReadBps: parsed.data.diskReadBps,
    diskWriteBps: parsed.data.diskWriteBps,
    netRxBytes: parsed.data.netRxBytes,
    netTxBytes: parsed.data.netTxBytes,
    netRxBps: parsed.data.netRxBps,
    netTxBps: parsed.data.netTxBps,
    dockerCpuPercent: parsed.data.dockerCpuPercent,
    dockerMemUsedBytes: parsed.data.dockerMemUsedBytes,
    dockerNetRxBps: parsed.data.dockerNetRxBps,
    dockerNetTxBps: parsed.data.dockerNetTxBps,
    dockerContainerCount: parsed.data.dockerContainerCount,
    temperatureC: parsed.data.temperatureC,
    gpuUtilPercent: parsed.data.gpuUtilPercent,
    gpuMemUsedBytes: parsed.data.gpuMemUsedBytes,
    gpuMemTotalBytes: parsed.data.gpuMemTotalBytes,
    gpuPowerWatts: parsed.data.gpuPowerWatts,
    uptimeSeconds: parsed.data.uptimeSeconds,
    processCount: parsed.data.processCount,
  });

  const appSettings = await getAppSettings();
  const sent = await sendTelegramOverloadIfNeeded(
    agent,
    {
      cpuPercent: parsed.data.cpuPercent,
      memUsedBytes: parsed.data.memUsedBytes,
      memTotalBytes: parsed.data.memTotalBytes,
      diskUsedBytes: parsed.data.diskUsedBytes,
      diskTotalBytes: parsed.data.diskTotalBytes,
    },
    appSettings,
    env.APP_URL
  );
  if (sent) {
    agent.lastTelegramAlertAt = now;
    await agent.save();
  }

  return NextResponse.json({ ok: true });
}
