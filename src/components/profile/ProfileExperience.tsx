import type { ProfileExperience } from '@/types/profile';

interface ProfileExperienceSectionProps {
  experience: ProfileExperience[];
}

function formatDateRange(start: string, end: string | null, isCurrent: boolean): string {
  const startDate = new Date(start + '-01');
  const startStr = startDate.toLocaleDateString('es-MX', { month: 'short', year: 'numeric' });

  if (isCurrent || !end) return `${startStr} — Presente`;

  const endDate = new Date(end + '-01');
  const endStr = endDate.toLocaleDateString('es-MX', { month: 'short', year: 'numeric' });
  return `${startStr} — ${endStr}`;
}

export function ProfileExperienceSection({ experience }: ProfileExperienceSectionProps) {
  if (!experience || experience.length === 0) return null;

  return (
    <section className="bg-white rounded-2xl p-6 md:p-8 shadow-sm border border-neutral-10">
      <h2 className="text-lg font-bold text-neutral-80 mb-5">Experiencia</h2>

      <div className="space-y-6">
        {experience.map((exp, index) => (
          <div key={exp.id || index} className="relative flex gap-4">
            {/* Timeline line */}
            {index < experience.length - 1 && (
              <div className="absolute left-5 top-12 bottom-0 w-px bg-neutral-20" />
            )}

            {/* Company icon */}
            <div className="shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-purple-10 to-blue-10
              border border-purple-20/50 flex items-center justify-center z-10">
              <svg className="w-5 h-5 text-purple-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
              </svg>
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-neutral-80">{exp.title}</h3>
              <p className="text-neutral-60 text-sm">{exp.company}</p>
              <p className="text-neutral-40 text-sm mt-0.5">
                {formatDateRange(exp.start_date, exp.end_date, exp.is_current)}
              </p>
              {exp.description && (
                <p className="text-neutral-50 text-sm mt-2 leading-relaxed whitespace-pre-line">
                  {exp.description}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
