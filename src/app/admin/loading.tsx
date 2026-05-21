export default function AdminLoading() {
  return (
    <div className="p-6 space-y-6 animate-pulse">
      {/* KPI cards skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-card rounded-2xl p-5 border border-border">
            <div className="h-3 bg-surface rounded w-1/2 mb-3" />
            <div className="h-7 bg-surface rounded w-2/3" />
          </div>
        ))}
      </div>
      {/* Chart skeleton */}
      <div className="bg-card rounded-2xl p-6 border border-border">
        <div className="h-4 bg-surface rounded w-1/4 mb-4" />
        <div className="h-48 bg-surface rounded" />
      </div>
      {/* Table skeleton */}
      <div className="bg-card rounded-2xl p-6 border border-border space-y-3">
        <div className="h-4 bg-surface rounded w-1/3 mb-4" />
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex gap-4">
            <div className="h-4 bg-surface rounded w-1/4" />
            <div className="h-4 bg-surface rounded w-1/3" />
            <div className="h-4 bg-surface rounded w-1/6" />
          </div>
        ))}
      </div>
    </div>
  );
}
