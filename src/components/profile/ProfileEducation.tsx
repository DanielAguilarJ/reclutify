import type { ProfileEducation } from '@/types/profile';

interface ProfileEducationSectionProps {
  education: ProfileEducation[];
}

export function ProfileEducationSection({ education }: ProfileEducationSectionProps) {
  if (!education || education.length === 0) return null;

  return (
    <section className="bg-white rounded-2xl p-6 md:p-8 shadow-sm border border-neutral-10">
      <h2 className="text-lg font-bold text-neutral-80 mb-5">Educación</h2>

      <div className="space-y-5">
        {education.map((edu, index) => (
          <div key={edu.id || index} className="flex gap-4">
            {/* Icon */}
            <div className="shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-10 to-lime-10
              border border-cyan-20/50 flex items-center justify-center">
              <svg className="w-5 h-5 text-cyan-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.438 60.438 0 00-.491 6.347A48.62 48.62 0 0112 20.904a48.62 48.62 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.636 50.636 0 00-2.658-.813A59.906 59.906 0 0112 3.493a59.903 59.903 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5" />
              </svg>
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-neutral-80">{edu.institution}</h3>
              <p className="text-neutral-60 text-sm">
                {edu.degree}{edu.field ? ` · ${edu.field}` : ''}
              </p>
              <p className="text-neutral-40 text-sm mt-0.5">
                {edu.start_year}
                {edu.end_year ? ` — ${edu.end_year}` : ' — Presente'}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
