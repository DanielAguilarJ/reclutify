export default function ProfileLoading() {
  return (
    <div className="min-h-screen bg-background">
      <div className="animate-pulse">
        {/* Banner */}
        <div className="h-48 bg-neutral-200 w-full" />

        {/* Profile card */}
        <div className="max-w-3xl mx-auto px-4 -mt-16 relative z-10">
          <div className="bg-white rounded-2xl border border-border p-6 shadow-sm">
            <div className="flex items-end gap-4 mb-6">
              <div className="w-28 h-28 rounded-full bg-neutral-200 border-4 border-white -mt-20" />
              <div className="flex-1 space-y-2 pb-2">
                <div className="h-6 bg-neutral-200 rounded w-48" />
                <div className="h-3.5 bg-neutral-100 rounded w-64" />
                <div className="h-3 bg-neutral-100 rounded w-32" />
              </div>
              <div className="w-28 h-9 rounded-lg bg-neutral-100" />
            </div>

            {/* Stats row */}
            <div className="flex gap-6 border-t border-neutral-100 pt-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="space-y-1">
                  <div className="h-5 bg-neutral-200 rounded w-8" />
                  <div className="h-3 bg-neutral-100 rounded w-16" />
                </div>
              ))}
            </div>
          </div>

          {/* About section */}
          <div className="bg-white rounded-2xl border border-border p-6 mt-4">
            <div className="h-5 bg-neutral-200 rounded w-24 mb-4" />
            <div className="space-y-2">
              <div className="h-3 bg-neutral-100 rounded w-full" />
              <div className="h-3 bg-neutral-100 rounded w-4/5" />
              <div className="h-3 bg-neutral-100 rounded w-2/3" />
            </div>
          </div>

          {/* Experience section */}
          <div className="bg-white rounded-2xl border border-border p-6 mt-4">
            <div className="h-5 bg-neutral-200 rounded w-32 mb-4" />
            {[1, 2].map((i) => (
              <div key={i} className="flex gap-3 py-4 border-b border-neutral-50 last:border-0">
                <div className="w-12 h-12 rounded-lg bg-neutral-100 shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-neutral-200 rounded w-40" />
                  <div className="h-3 bg-neutral-100 rounded w-32" />
                  <div className="h-2.5 bg-neutral-50 rounded w-24" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
