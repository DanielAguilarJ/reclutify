export default function FeedLoading() {
  return (
    <main className="max-w-2xl mx-auto px-4 py-6 space-y-4">
      {/* Post Composer Skeleton */}
      <div className="bg-white rounded-2xl border border-border p-4 animate-pulse">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-neutral-200" />
          <div className="flex-1 h-10 rounded-xl bg-neutral-100" />
        </div>
        <div className="flex justify-end gap-2">
          <div className="w-20 h-8 rounded-lg bg-neutral-100" />
        </div>
      </div>

      {/* Feed Cards Skeleton */}
      {[1, 2, 3].map((i) => (
        <div key={i} className="bg-white rounded-2xl border border-border p-5 animate-pulse">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-neutral-200" />
            <div className="space-y-2 flex-1">
              <div className="h-3.5 bg-neutral-200 rounded w-32" />
              <div className="h-2.5 bg-neutral-100 rounded w-48" />
            </div>
          </div>
          <div className="space-y-2 mb-4">
            <div className="h-3 bg-neutral-100 rounded w-full" />
            <div className="h-3 bg-neutral-100 rounded w-4/5" />
            <div className="h-3 bg-neutral-100 rounded w-3/5" />
          </div>
          {i === 1 && <div className="h-48 bg-neutral-100 rounded-xl mb-4" />}
          <div className="flex items-center gap-6 pt-3 border-t border-neutral-100">
            <div className="h-3 bg-neutral-100 rounded w-12" />
            <div className="h-3 bg-neutral-100 rounded w-16" />
            <div className="h-3 bg-neutral-100 rounded w-14" />
          </div>
        </div>
      ))}
    </main>
  );
}
