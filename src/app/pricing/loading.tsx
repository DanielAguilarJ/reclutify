export default function PricingLoading() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="animate-pulse space-y-4 w-full max-w-4xl px-6">
        <div className="h-10 bg-surface rounded-xl w-1/3 mx-auto" />
        <div className="h-6 bg-surface rounded-lg w-2/3 mx-auto" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-80 bg-surface rounded-2xl" />
          ))}
        </div>
      </div>
    </div>
  );
}
