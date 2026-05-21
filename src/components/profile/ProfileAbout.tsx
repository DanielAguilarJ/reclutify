import type { Profile } from '@/types/profile';

interface ProfileAboutProps {
  profile: Profile;
}

export function ProfileAbout({ profile }: ProfileAboutProps) {
  const hasBio = profile.bio && profile.bio.trim().length > 0;
  const hasSkills = profile.skills && profile.skills.length > 0;

  if (!hasBio && !hasSkills) return null;

  return (
    <section className="bg-card rounded-2xl p-6 md:p-8 shadow-sm border border-border">
      {/* Bio */}
      {hasBio && (
        <div className="mb-6">
          <h2 className="text-lg font-bold text-foreground mb-3">Acerca de</h2>
          <p className="text-muted leading-relaxed whitespace-pre-line">
            {profile.bio}
          </p>
        </div>
      )}

      {/* Skills */}
      {hasSkills && (
        <div>
          <h2 className="text-lg font-bold text-foreground mb-3">Habilidades</h2>
          <div className="flex flex-wrap gap-2">
            {profile.skills.map((skill, i) => (
              <span
                key={`${skill}-${i}`}
                className="px-3 py-1.5 rounded-lg text-sm font-medium
                  bg-primary-light text-primary border border-primary/20
                  hover:bg-primary/10 transition-colors cursor-default"
              >
                {skill}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
