'use client';

interface TopicScoreBarProps {
  topic: string;
  score: number;
  maxScore?: number;
}

export default function TopicScoreBar({
  topic,
  score,
  maxScore = 10,
}: TopicScoreBarProps) {
  const percentage = (score / maxScore) * 100;

  const getColor = (score: number) => {
    if (score >= 8) return 'bg-success';
    if (score >= 6) return 'bg-primary';
    if (score >= 4) return 'bg-warning';
    return 'bg-danger';
  };

  return (
    <div className="flex items-center gap-4">
      <span className="text-sm text-foreground w-52 truncate">{topic}</span>
      <div className="flex-1 h-2.5 rounded-full bg-border/40 overflow-hidden">
        <div
          className={`h-full rounded-full ${getColor(score)} transition-all duration-700 ease-out`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span className="text-sm font-semibold text-foreground w-10 text-right">
        {score}/{maxScore}
      </span>
    </div>
  );
}
