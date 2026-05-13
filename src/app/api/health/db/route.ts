import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectDB } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function safeErr(err: unknown): { name: string; code?: number; message: string } {
  if (!err || typeof err !== 'object') {
    return { name: 'Error', message: 'Unknown error' };
  }
  const e = err as { name?: string; message?: string; code?: number };
  let msg = String(e.message ?? 'error');
  msg = msg.replace(/\/\/([^:@/]+):([^@/]+)@/g, '//***:***@');
  return {
    name: String(e.name ?? 'Error'),
    code: typeof e.code === 'number' ? e.code : undefined,
    message: msg.slice(0, 800),
  };
}

export async function GET() {
  try {
    await connectDB();
    await mongoose.connection.db.admin().command({ ping: 1 });
    return NextResponse.json({
      ok: true,
      database: mongoose.connection.db?.databaseName ?? null,
    });
  } catch (err) {
    const s = safeErr(err);
    const authHint =
      /authentication|auth failed|bad auth/i.test(s.message) || s.code === 18
        ? 'Often fixed by appending ?authSource=admin (or the database where this user was created) to MONGODB_URI.'
        : undefined;
    return NextResponse.json(
      {
        ok: false,
        error: s,
        hint: authHint,
      },
      { status: 503 }
    );
  }
}
