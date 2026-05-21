export default function InterviewLoading() {
  return (
    <div className="min-h-screen bg-[#1a1b23] text-white flex">
      {/* Sidebar Skeleton */}
      <div className="hidden lg:flex flex-col w-72 border-r border-white/10 p-6 animate-pulse">
        <div className="h-6 bg-white/10 rounded w-32 mb-8" />
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-xl">
              <div className="w-5 h-5 rounded-full bg-white/10" />
              <div className="h-3 bg-white/10 rounded flex-1" />
            </div>
          ))}
        </div>
        <div className="mt-auto space-y-3">
          <div className="h-3 bg-white/5 rounded w-24" />
          <div className="h-2 bg-white/5 rounded-full w-full" />
        </div>
      </div>

      {/* Main Interview Area */}
      <div className="flex-1 flex flex-col items-center justify-center p-8 animate-pulse">
        {/* AI Orb placeholder */}
        <div className="w-40 h-40 rounded-full bg-gradient-to-br from-[#D3FB52]/10 to-[#00D3D8]/10 border border-white/10 mb-12" />

        {/* Transcript area */}
        <div className="w-full max-w-xl space-y-4 mb-8">
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-white/10 shrink-0" />
            <div className="bg-white/5 rounded-2xl px-4 py-3 flex-1 space-y-2">
              <div className="h-3 bg-white/10 rounded w-4/5" />
              <div className="h-3 bg-white/10 rounded w-3/5" />
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-white/10" />
          <div className="w-14 h-14 rounded-full bg-white/10" />
        </div>
      </div>
    </div>
  );
}
