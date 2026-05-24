'use client';

import { useEffect, useState } from 'react';
import { useInfoSessionStore } from '@/store/infoSessionStore';

export default function ClosingPresential() {
  const {
    clientName,
    course,
    coachAttended,
    subscribeToSessionUpdates,
    updateSessionStatus,
  } = useInfoSessionStore();

  const [showSuccess, setShowSuccess] = useState(false);

  // Subscribe to real-time updates for coach attendance
  useEffect(() => {
    const unsubscribe = subscribeToSessionUpdates();
    updateSessionStatus('closed_presential');
    return unsubscribe;
  }, [subscribeToSessionUpdates, updateSessionStatus]);

  // Animate success when coach attends
  useEffect(() => {
    if (coachAttended) {
      setTimeout(() => setShowSuccess(true), 300);
    }
  }, [coachAttended]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[500px] px-6 text-center">
      {/* Animated container */}
      <div className="relative mb-8">
        {/* Pulse rings */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-32 h-32 rounded-full border-2 border-[#D3FB52]/20 animate-[ping_2s_ease-in-out_infinite]" />
        </div>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-24 h-24 rounded-full border-2 border-[#D3FB52]/30 animate-[ping_2s_ease-in-out_infinite_0.5s]" />
        </div>

        {/* Main circle */}
        <div
          className={`relative w-28 h-28 rounded-full flex items-center justify-center transition-all duration-700 ${
            coachAttended
              ? 'bg-[#D3FB52] scale-110'
              : 'bg-[#D3FB52]/20 border-2 border-[#D3FB52]/50'
          }`}
        >
          {coachAttended ? (
            <svg
              className={`w-14 h-14 text-black transition-all duration-500 ${
                showSuccess ? 'scale-100 opacity-100' : 'scale-50 opacity-0'
              }`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg className="w-12 h-12 text-[#D3FB52] animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          )}
        </div>
      </div>

      {/* Content */}
      {coachAttended ? (
        <div className="space-y-4 animate-[fadeIn_0.5s_ease-out]">
          <h2 className="text-2xl font-bold text-white">
            Su asesor ya esta con usted
          </h2>
          <p className="text-gray-400 max-w-sm">
            Gracias por su tiempo, <span className="text-[#D3FB52] font-medium">{clientName}</span>.
            Esperamos que la sesion haya sido de su agrado.
          </p>
          {course && (
            <div className="mt-6 px-4 py-3 rounded-xl bg-white/5 border border-white/10 inline-block">
              <p className="text-sm text-gray-400">Curso de interes:</p>
              <p className="text-[#D3FB52] font-semibold">{course.name}</p>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <h2 className="text-2xl font-bold text-white">
            Su asesor ha sido notificado
          </h2>
          <p className="text-lg text-gray-300">
            y viene en camino
          </p>
          <div className="mt-4 space-y-2">
            <p className="text-gray-400">
              <span className="text-white font-medium">{clientName}</span>, su sesion ha sido un exito.
            </p>
            {course && (
              <p className="text-gray-500 text-sm">
                Curso: <span className="text-[#D3FB52]">{course.name}</span>
              </p>
            )}
          </div>

          {/* Waiting animation dots */}
          <div className="flex items-center justify-center gap-2 mt-8">
            <span className="text-sm text-gray-500">Esperando al asesor</span>
            <div className="flex gap-1">
              <span className="w-1.5 h-1.5 bg-[#D3FB52] rounded-full animate-bounce" />
              <span className="w-1.5 h-1.5 bg-[#D3FB52] rounded-full animate-bounce [animation-delay:0.2s]" />
              <span className="w-1.5 h-1.5 bg-[#D3FB52] rounded-full animate-bounce [animation-delay:0.4s]" />
            </div>
          </div>
        </div>
      )}

      {/* CSS animation for fade in */}
      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
