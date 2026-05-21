export default function MessagesLoading() {
  return (
    <div className="min-h-screen bg-background flex">
      {/* Conversation list sidebar */}
      <div className="w-80 border-r border-border bg-white p-4 animate-pulse">
        <div className="h-6 bg-neutral-200 rounded w-24 mb-6" />
        <div className="h-10 bg-neutral-100 rounded-xl mb-4" />
        <div className="space-y-2">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="flex items-center gap-3 p-3 rounded-xl">
              <div className="w-10 h-10 rounded-full bg-neutral-200 shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-3.5 bg-neutral-200 rounded w-28" />
                <div className="h-2.5 bg-neutral-100 rounded w-40" />
              </div>
              <div className="h-2.5 bg-neutral-50 rounded w-10" />
            </div>
          ))}
        </div>
      </div>

      {/* Message panel */}
      <div className="flex-1 flex flex-col animate-pulse">
        {/* Chat header */}
        <div className="px-6 py-4 border-b border-border flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-neutral-200" />
          <div className="space-y-1.5">
            <div className="h-4 bg-neutral-200 rounded w-32" />
            <div className="h-2.5 bg-neutral-100 rounded w-20" />
          </div>
        </div>

        {/* Messages area */}
        <div className="flex-1 p-6 space-y-4">
          <div className="flex gap-3 max-w-md">
            <div className="w-8 h-8 rounded-full bg-neutral-200 shrink-0" />
            <div className="bg-neutral-100 rounded-2xl px-4 py-3 space-y-2 flex-1">
              <div className="h-3 bg-neutral-200 rounded w-4/5" />
              <div className="h-3 bg-neutral-200 rounded w-3/5" />
            </div>
          </div>
          <div className="flex gap-3 max-w-md ml-auto flex-row-reverse">
            <div className="w-8 h-8 rounded-full bg-neutral-200 shrink-0" />
            <div className="bg-primary-light rounded-2xl px-4 py-3 space-y-2 flex-1">
              <div className="h-3 bg-neutral-200 rounded w-3/4" />
            </div>
          </div>
        </div>

        {/* Input area */}
        <div className="px-6 py-4 border-t border-border flex items-center gap-3">
          <div className="flex-1 h-10 bg-neutral-100 rounded-xl" />
          <div className="w-10 h-10 bg-neutral-200 rounded-xl" />
        </div>
      </div>
    </div>
  );
}
