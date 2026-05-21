export default function Logo({ 
  size = 'default', 
  forceWhiteLabel = false,
  companyName
}: { 
  size?: 'default' | 'small' | 'large', 
  forceWhiteLabel?: boolean,
  companyName?: string
}) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={`font-black tracking-tight text-black dark:text-white ${
          size === 'small' ? 'text-xl' : size === 'large' ? 'text-4xl' : 'text-2xl'
        }`}
      >
        {companyName || (forceWhiteLabel ? 'reclutify' : 'reclutify')}
      </span>
    </div>
  );
}
