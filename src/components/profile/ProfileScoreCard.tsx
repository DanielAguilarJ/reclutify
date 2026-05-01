import type { ProfileScoreResult } from '@/types/profile';

interface ProfileScoreCardProps {
  score: ProfileScoreResult;
}

export function ProfileScoreCard({ score }: ProfileScoreCardProps) {
  const getScoreColor = (s: number) => {
    if (s >= 80) return { ring: 'text-green-60', bg: 'bg-green-10', label: 'Excelente' };
    if (s >= 60) return { ring: 'text-blue-50', bg: 'bg-blue-10', label: 'Bueno' };
    if (s >= 40) return { ring: 'text-orange-50', bg: 'bg-orange-10', label: 'Mejorable' };
    return { ring: 'text-red-50', bg: 'bg-red-30/10', label: 'Incompleto' };
  };

  const colors = getScoreColor(score.score);
  const circumference = 2 * Math.PI * 40;
  const strokeDashoffset = circumference - (score.score / 100) * circumference;

  return (
    <section className="bg-white rounded-2xl p-6 md:p-8 shadow-sm border border-neutral-10">
      <h2 className="text-lg font-bold text-neutral-80 mb-4">
        <span className="inline-flex items-center gap-2">
          <svg className="w-5 h-5 text-purple-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
          </svg>
          AI Profile Score
        </span>
      </h2>

      <div className="flex items-center gap-6">
        {/* Circular score */}
        <div className="relative w-24 h-24 shrink-0">
          <svg className="w-24 h-24 -rotate-90" viewBox="0 0 96 96">
            <circle cx="48" cy="48" r="40" fill="none" stroke="currentColor"
              className="text-neutral-10" strokeWidth="6" />
            <circle cx="48" cy="48" r="40" fill="none" stroke="currentColor"
              className={`${colors.ring} transition-all duration-1000 ease-out`}
              strokeWidth="6" strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset} />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-bold text-neutral-80">{score.score}</span>
            <span className="text-[10px] font-medium text-neutral-40">{colors.label}</span>
          </div>
        </div>

        {/* Suggestions */}
        <div className="flex-1 min-w-0">
          {score.suggestions.length > 0 && (
            <ul className="space-y-1.5">
              {score.suggestions.slice(0, 3).map((s, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-neutral-50">
                  <span className="shrink-0 mt-1 w-1.5 h-1.5 rounded-full bg-orange-50" />
                  {s}
                </li>
              ))}
            </ul>
          )}
          {score.strengths.length > 0 && score.suggestions.length === 0 && (
            <p className="text-sm text-green-60 font-medium">
              ¡Perfil completo! Tu perfil está optimizado para reclutadores.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
