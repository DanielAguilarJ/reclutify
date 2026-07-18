import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json(
    {
      error: 'Sessions are persisted by /api/training/chat',
    },
    {
      status: 410,
    }
  );
}
