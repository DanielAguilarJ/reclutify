import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function POST(req: Request) {
  try {
    // We check the secret from headers (or body if Make passed it there)
    const secret = req.headers.get('x-api-key');
    if (secret && secret !== process.env.MAKE_WEBHOOK_SECRET) {
      // return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      console.warn("x-api-key did not match MAKE_WEBHOOK_SECRET");
    }

    const body = await req.json();
    const { roleId, roleTitle, candidates, language } = body;

    if (!roleId || !roleTitle || !candidates || !Array.isArray(candidates)) {
      return NextResponse.json({ error: 'Missing required fields or invalid candidates format' }, { status: 400 });
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://reclutify.com';
    const supabase = await createClient();
    const results = [];

    for (const candidate of candidates) {
      if (!candidate.email) continue;
      
      // Make sets candidateId as email directly in its URL, but if we need to trace it:
      const candidateId = candidate.email;
      const interviewLink = `${baseUrl}/interview?candidateId=${encodeURIComponent(candidateId)}&roleId=${encodeURIComponent(roleId)}`;

      const { data, error } = await supabase.from('candidate_invites').insert({
        id: candidateId,
        role_id: roleId,
        role_title: roleTitle,
        candidate_email: candidate.email,
        candidate_name: candidate.name || '',
        interview_link: interviewLink,
        status: 'pending',
      });

      if (error) {
        console.error('Supabase insert error:', error);
      }

      results.push({
        candidateId,
        email: candidate.email,
        interviewLink,
        inserted: !error
      });
    }

    return NextResponse.json({ success: true, results });
  } catch (err: any) {
    console.error('invite-candidates error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
