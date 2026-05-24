'use client';

interface InfoAiOrbProps {
  isSpeaking: boolean;
  isListening: boolean;
  isThinking: boolean;
}

export default function InfoAiOrb({ isSpeaking, isListening, isThinking }: InfoAiOrbProps) {
  return (
    <div className="relative flex items-center justify-center w-48 h-48">
      {/* Outermost glow ring */}
      <div
        className={`absolute rounded-full blur-xl transition-all duration-700 ${
          isSpeaking
            ? 'w-44 h-44 opacity-70 animate-[pulse-orb_1.5s_ease-in-out_infinite]'
            : isThinking
            ? 'w-40 h-40 opacity-50 animate-[pulse-orb_2s_ease-in-out_infinite]'
            : 'w-36 h-36 opacity-40 animate-[pulse-orb_3s_ease-in-out_infinite]'
        }`}
        style={{
          background: 'radial-gradient(circle, rgba(211,251,82,0.5) 0%, rgba(163,230,53,0.3) 50%, transparent 70%)',
        }}
      />

      {/* Secondary ring */}
      <div
        className={`absolute rounded-full blur-lg transition-all duration-500 ${
          isSpeaking
            ? 'w-36 h-36 opacity-80 animate-[pulse-orb_1.2s_ease-in-out_infinite_0.2s]'
            : isThinking
            ? 'w-32 h-32 opacity-60 animate-[pulse-orb_1.8s_ease-in-out_infinite_0.1s]'
            : 'w-30 h-30 opacity-50 animate-[pulse-orb_2.5s_ease-in-out_infinite_0.2s]'
        }`}
        style={{
          background: 'radial-gradient(circle, rgba(211,251,82,0.7) 0%, rgba(132,204,22,0.5) 60%, transparent 80%)',
        }}
      />

      {/* Tertiary inner ring */}
      <div
        className={`absolute rounded-full blur-md transition-all duration-300 ${
          isSpeaking
            ? 'w-28 h-28 opacity-90 animate-[pulse-orb_1s_ease-in-out_infinite_0.1s]'
            : 'w-26 h-26 opacity-60 animate-[pulse-orb_2s_ease-in-out_infinite_0.3s]'
        }`}
        style={{
          background: 'radial-gradient(circle, rgba(211,251,82,0.8) 0%, rgba(190,242,100,0.6) 70%, transparent 90%)',
        }}
      />

      {/* Main orb */}
      <div
        className={`relative z-10 flex items-center justify-center rounded-full shadow-lg border border-white/10 transition-transform duration-300 ${
          isSpeaking
            ? 'w-20 h-20 animate-[scale-orb_1.5s_ease-in-out_infinite]'
            : isThinking
            ? 'w-20 h-20 animate-[wobble_0.5s_ease-in-out_infinite]'
            : 'w-20 h-20'
        }`}
        style={{
          background: 'linear-gradient(135deg, #D3FB52 0%, #84cc16 100%)',
          boxShadow: '0 0 30px rgba(211,251,82,0.4), inset 0 -2px 6px rgba(0,0,0,0.1)',
        }}
      >
        {/* Inner icon / branding */}
        <span className="text-xl font-black tracking-tight text-black/80 select-none">
          R.
        </span>
      </div>

      {/* Listening indicator (microphone pulse) */}
      {isListening && (
        <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1">
          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-black/80 animate-[pulse-orb_1s_ease-in-out_infinite]">
            <svg
              className="w-4 h-4 text-[#D3FB52]"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1-9c0-.55.45-1 1-1s1 .45 1 1v6c0 .55-.45 1-1 1s-1-.45-1-1V5z" />
              <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
            </svg>
          </div>
          {/* Sound wave dots */}
          <div className="flex gap-0.5">
            <span className="w-1 h-3 bg-[#D3FB52] rounded-full animate-[sound-wave_0.6s_ease-in-out_infinite]" />
            <span className="w-1 h-4 bg-[#D3FB52] rounded-full animate-[sound-wave_0.6s_ease-in-out_infinite_0.1s]" />
            <span className="w-1 h-2 bg-[#D3FB52] rounded-full animate-[sound-wave_0.6s_ease-in-out_infinite_0.2s]" />
          </div>
        </div>
      )}

      {/* Thinking dots */}
      {isThinking && !isSpeaking && (
        <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5">
          <span className="w-2 h-2 bg-[#D3FB52] rounded-full animate-[bounce_1s_ease-in-out_infinite]" />
          <span className="w-2 h-2 bg-[#D3FB52] rounded-full animate-[bounce_1s_ease-in-out_infinite_0.2s]" />
          <span className="w-2 h-2 bg-[#D3FB52] rounded-full animate-[bounce_1s_ease-in-out_infinite_0.4s]" />
        </div>
      )}

      {/* CSS Keyframes */}
      <style jsx>{`
        @keyframes pulse-orb {
          0%, 100% { transform: scale(1); opacity: var(--tw-opacity, 1); }
          50% { transform: scale(1.15); opacity: calc(var(--tw-opacity, 1) * 1.2); }
        }
        @keyframes scale-orb {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.06); }
        }
        @keyframes wobble {
          0%, 100% { transform: rotate(0deg); }
          25% { transform: rotate(3deg); }
          75% { transform: rotate(-3deg); }
        }
        @keyframes sound-wave {
          0%, 100% { transform: scaleY(1); }
          50% { transform: scaleY(1.8); }
        }
      `}</style>
    </div>
  );
}
