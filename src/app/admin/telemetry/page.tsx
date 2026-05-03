import { createClient } from '@/utils/supabase/server';
import { redirect } from 'next/navigation';
import TelemetryDashboard from './TelemetryDashboard';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function TelemetryPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Fetch the latest 100 telemetry logs
  const { data: logs, error } = await supabase
    .from('interview_telemetry')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    console.error('Error fetching telemetry:', error);
  }

  return (
    <div className="p-6 max-w-[1600px] mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">AI Telemetry Dashboard</h1>
        <p className="text-muted text-sm mt-1">
          Real-time logs of AI reasoning, token usage, and latency during interviews.
        </p>
      </div>

      <TelemetryDashboard initialLogs={logs || []} />
    </div>
  );
}
