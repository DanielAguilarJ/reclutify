import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Centro de Capacitación | Reclutify',
  robots: {
    index: false,
    follow: false,
  },
};

export default function TrainingTokenLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
