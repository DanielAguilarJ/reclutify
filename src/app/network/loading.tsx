export default function NetworkLoading() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto px-4 py-6 animate-pulse">
        {/* Header */}
        <div className="mb-8">
          <div className="h-7 bg-neutral-200 rounded w-40 mb-2" />
          <div className="h-4 bg-neutral-100 rounded w-64" />
        </div>

        {/* Search bar */}
        <div className="h-11 bg-white border border-border rounded-xl mb-8" />

        {/* Connection cards grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="bg-white rounded-2xl border border-border overflow-hidden">
              <div className="h-20 bg-neutral-100" />
              <div className="p-4 pt-0 -mt-8 flex flex-col items-center text-center">
                <div className="w-16 h-16 rounded-full bg-neutral-200 border-4 border-white mb-3" />
                <div className="h-4 bg-neutral-200 rounded w-28 mb-1.5" />
                <div className="h-3 bg-neutral-100 rounded w-36 mb-3" />
                <div className="h-8 bg-neutral-100 rounded-lg w-24" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
