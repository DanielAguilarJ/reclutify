export default function CareerFairLoading() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        <div className="animate-pulse">
          <div className="h-10 bg-surface rounded-xl w-1/4 mb-4" />
          <div className="h-12 bg-surface rounded-xl w-full mb-8" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-48 bg-surface rounded-2xl" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
