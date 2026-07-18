import 'server-only';

import { NextResponse } from 'next/server';
import { TrainingAuthError } from './auth';

export function trainingApiErrorResponse(
  error: unknown,
  context: string
) {
  console.error(context, error);

  if (error instanceof TrainingAuthError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.status }
    );
  }

  return NextResponse.json(
    { error: 'Internal server error' },
    { status: 500 }
  );
}
