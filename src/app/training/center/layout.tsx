import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Centro de Capacitación | Reclutify',
  robots: { index: false, follow: false },
};

export default async function TrainingCenterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  // Check if user is authenticated
  const { data: { user } } = await supabase.auth.getUser();

  // If not authenticated, check if the training store was initialized via token
  // Token-based access sets a cookie/session - if no user and no valid session, redirect
  if (!user) {
    // Allow access - the client-side trainingStore handles token validation
    // The center/page.tsx will redirect to / if no employee is loaded
    return <>{children}</>;
  }

  // If authenticated, verify they are actually a training employee
  const { data: trainingEmployee } = await supabase
    .from('training_employees')
    .select('id, status')
    .eq('user_id', user.id)
    .neq('status', 'completed')
    .limit(1)
    .single();

  // If they have a training assignment, allow access
  if (trainingEmployee) {
    return <>{children}</>;
  }

  // If authenticated but not a training employee, check if they're an employer
  // Employers should still be able to preview - allow through
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('user_type')
    .eq('user_id', user.id)
    .single();

  if (profile?.user_type === 'employer') {
    return <>{children}</>;
  }

  // Otherwise redirect to home
  redirect('/');
}
