export default function PracticeLoading() {
  return (
    <div className="min-h-screen bg-[#1a1b23] text-white flex flex-col items-center justify-center p-8 animate-pulse">
      {/* Header skeleton */}
      <div className="w-full max-w-2xl mb-12">
        <div className="h-8 bg-white/10 rounded w-48 mx-auto mb-4" />
        <div className="h-4 bg-white/5 rounded w-72 mx-auto" />
      </div>

      {/* Practice orb */}
      <div className="w-36 h-36 rounded-full bg-gradient-to-br from-[#D3FB52]/10 to-[#00D3D8]/10 border border-white/10 mb-10" />

      {/* Chat area placeholder */}
      <div className="w-full max-w-xl space-y-4 mb-8">
        <div className="flex gap-3">
          <div className="w-8 h-8 rounded-full bg-white/10 shrink-0" />
          <div className="bg-white/5 rounded-2xl px-4 py-3 flex-1 space-y-2">
            <div className="h-3 bg-white/10 rounded w-3/4" />
            <div className="h-3 bg-white/10 rounded w-1/2" />
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-4">
        <div className="w-14 h-14 rounded-full bg-white/10" />
        <div className="w-24 h-10 rounded-xl bg-white/10" />
      </div>
    </div>
  );
}
