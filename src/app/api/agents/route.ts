import { NextResponse } from 'next/server';
import { getAppSettings } from '@/lib/app-settings';
import { connectDB } from '@/lib/db';
import { Agent } from '@/lib/models/Agent';
import { Metric } from '@/lib/models/Metric';
import { getSessionFromCookies } from '@/lib/auth';
import { env } from '@/lib/env';
import {
  sendTelegramDisconnectIfNeeded,
  shouldSendTelegramDisconnectAlert,
} from '@/lib/telegram-alerts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getSessionFromCookies();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await connectDB();
  /** Stable order (not by lastSeenAt) so dashboard / server list cards do not reorder every heartbeat. */
  const agents = await Agent.find({}).sort({ hostname: 1, agentId: 1 }).lean();
  const ids = agents.map((a) => a.agentId);

  const latest = await Metric.aggregate([
    { $match: { agentId: { $in: ids } } },
    { $sort: { ts: -1 } },
    { $group: { _id: '$agentId', metric: { $first: '$$ROOT' } } },
  ]);
  const latestMap = new Map<string, (typeof latest)[number]['metric']>();
  for (const item of latest) latestMap.set(item._id, item.metric);

  const offlineMs = env.AGENT_OFFLINE_AFTER_SECONDS * 1000;
  const now = Date.now();
  const offlineAlertAt = new Date();

  const data = agents.map((a) => {
    const m = latestMap.get(a.agentId);
    const online =
      a.lastSeenAt && now - new Date(a.lastSeenAt).getTime() <= offlineMs ? true : false;
    return {
      agentId: a.agentId,
      hostname: a.hostname,
      label: a.label,
      os: a.os,
      osVersion: a.osVersion,
      kernel: a.kernel,
      arch: a.arch,
      cpuModel: a.cpuModel,
      cpuCores: a.cpuCores,
      totalMemoryBytes: a.totalMemoryBytes,
      totalDiskBytes: a.totalDiskBytes,
      publicIp: a.publicIp,
      privateIp: a.privateIp,
      tags: a.tags,
      online,
      lastSeenAt: a.lastSeenAt,
      registeredAt: a.registeredAt,
      latest: m
        ? {
            ts: m.ts,
            cpuPercent: m.cpuPercent,
            memUsedBytes: m.memUsedBytes,
            memTotalBytes: m.memTotalBytes,
            diskUsedBytes: m.diskUsedBytes,
            diskTotalBytes: m.diskTotalBytes,
            diskReadBps: m.diskReadBps,
            diskWriteBps: m.diskWriteBps,
            netRxBytes: m.netRxBytes,
            netTxBytes: m.netTxBytes,
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
            uptimeSeconds: m.uptimeSeconds,
            loadAvg1: m.loadAvg1,
          }
        : null,
    };
  });

  const offlineAlertCandidates = agents.filter((a) => {
    const online =
      a.lastSeenAt && now - new Date(a.lastSeenAt).getTime() <= offlineMs ? true : false;
    return !online && shouldSendTelegramDisconnectAlert(a);
  });
  if (offlineAlertCandidates.length > 0) {
    const appSettings = await getAppSettings();
    for (const agent of offlineAlertCandidates) {
      const sent = await sendTelegramDisconnectIfNeeded(agent, appSettings, env.APP_URL, 'offline');
      if (sent) {
        await Agent.updateOne(
          { agentId: agent.agentId },
          { $set: { lastTelegramOfflineAlertAt: offlineAlertAt } }
        );
      }
    }
  }

  return NextResponse.json({ agents: data });
}
