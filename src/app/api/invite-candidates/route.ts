import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

// Bug 17 fix: token generator matching the format used by the in-app
// ticketStore (8-character alphanumeric, omitting visually ambiguous chars).
function generateInviteToken(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let token = '';
  for (let i = 0; i < 8; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

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

    // Bug 17 fix: the only working candidate entry point is /interview/t/[token]
    // backed by the `interview_tickets` table. The old format
    // `/interview?candidateId=…&roleId=…` always lands on the "Access Restricted"
    // page. We now create one ticket per invitee and emit the correct URL.
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://reclutify.com';
    const ticketLanguage: 'en' | 'es' = language === 'en' ? 'en' : 'es';
    const supabase = await createClient();
    const results = [];

    // Resolve org_id once from the role (interview_tickets is org-scoped via RLS).
    const { data: roleRow } = await supabase
      .from('roles')
      .select('org_id')
      .eq('id', roleId)
      .single();
    const orgId = roleRow?.org_id || null;

    for (const candidate of candidates) {
      if (!candidate.email) continue;

      const now = Date.now();
      const token = generateInviteToken();
      const ticketId = `ticket-${now}-${Math.random().toString(36).slice(2, 8)}`;
      const interviewLink = `${baseUrl}/interview/t/${token}`;

      // 1) Insert the ticket — this is what the /interview/t/[token] route reads.
      const { error: ticketErr } = await supabase.from('interview_tickets').insert({
        id: ticketId,
        token,
        candidate_name: candidate.name || candidate.email,
        role_id: roleId,
        language: ticketLanguage,
        created_at: now,
        expires_at: now + 24 * 60 * 60 * 1000, // 24h
        used: false,
        org_id: orgId,
      });
      if (ticketErr) {
        console.error('Supabase ticket insert error:', ticketErr);
      }

      // 2) Mirror to candidate_invites (legacy tracking table, kept for the
      //    admin pipeline / external integrations).
      const candidateId = candidate.email;
      const { error: inviteErr } = await supabase.from('candidate_invites').insert({
        id: candidateId,
        role_id: roleId,
        role_title: roleTitle,
        candidate_email: candidate.email,
        candidate_name: candidate.name || '',
        interview_link: interviewLink,
        status: 'pending',
      });
      if (inviteErr) {
        console.error('Supabase invite insert error:', inviteErr);
      }

      results.push({
        candidateId,
        email: candidate.email,
        token,
        interviewLink,
        inserted: !ticketErr && !inviteErr,
      });
    }

    return NextResponse.json({ success: true, results });
  } catch (err: any) {
    console.error('invite-candidates error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
