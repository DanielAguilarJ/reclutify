'use client';

import { useState } from 'react';
import { useInfoSessionStore } from '@/store/infoSessionStore';

export default function ClosingRemote() {
  const {
    sessionId,
    course,
    clientName,
    updateSessionStatus,
    syncTranscript,
  } = useInfoSessionStore();

  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [preferredTime, setPreferredTime] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setIsSubmitting(true);
    setError('');

    try {
      // Update session with contact info
      const store = useInfoSessionStore.getState();
      store.setClientDetails({
        clientName,
        clientEmail: email.trim(),
        clientPhone: phone.trim(),
      });

      await updateSessionStatus('closed_remote');
      await syncTranscript();

      // Notify coach about new lead
      await fetch('/api/info-notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          type: 'new_lead',
          orgId: course?.orgId,
          metadata: {
            clientName,
            email: email.trim(),
            phone: phone.trim(),
            preferredTime: preferredTime.trim(),
            courseName: course?.name,
          },
        }),
      });

      setIsSubmitted(true);
    } catch {
      setError('Hubo un error al enviar tus datos. Intenta de nuevo.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSubmitted) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[500px] px-6 text-center">
        {/* Success state */}
        <div className="w-20 h-20 rounded-full bg-[#D3FB52] flex items-center justify-center mb-6 animate-[scaleIn_0.3s_ease-out]">
          <svg className="w-10 h-10 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
        </div>

        <h2 className="text-2xl font-bold text-white mb-3">
          Listo!
        </h2>
        <p className="text-gray-300 text-lg max-w-sm mb-2">
          Un asesor se pondra en contacto contigo pronto.
        </p>
        <p className="text-gray-500 text-sm max-w-sm">
          Hemos enviado tus datos a nuestro equipo. Te contactaremos a{' '}
          <span className="text-[#D3FB52]">{email}</span>
          {preferredTime && (
            <> en tu horario preferido: <span className="text-white">{preferredTime}</span></>
          )}
        </p>

        {course && (
          <div className="mt-8 px-5 py-3 rounded-xl bg-white/5 border border-white/10">
            <p className="text-sm text-gray-400">Curso de interes:</p>
            <p className="text-[#D3FB52] font-semibold">{course.name}</p>
          </div>
        )}

        <p className="mt-8 text-xs text-gray-600">
          Gracias por tu interes, {clientName}. Nos vemos pronto.
        </p>

        <style jsx>{`
          @keyframes scaleIn {
            from { transform: scale(0.5); opacity: 0; }
            to { transform: scale(1); opacity: 1; }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[500px] px-6">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-full bg-[#D3FB52]/20 flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-[#D3FB52]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">
            Nos gustaria contactarte
          </h2>
          <p className="text-gray-400 text-sm">
            Para darte mas detalles sobre{' '}
            {course ? (
              <span className="text-[#D3FB52] font-medium">{course.name}</span>
            ) : (
              'el curso'
            )}
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Email - Required */}
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-1.5">
              Correo electronico <span className="text-[#D3FB52]">*</span>
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@correo.com"
              required
              className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#D3FB52]/50 focus:border-[#D3FB52]/50 transition-all"
            />
          </div>

          {/* Phone - Optional */}
          <div>
            <label htmlFor="phone" className="block text-sm font-medium text-gray-300 mb-1.5">
              Telefono <span className="text-gray-500 text-xs">(opcional)</span>
            </label>
            <input
              id="phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+52 55 1234 5678"
              className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#D3FB52]/50 focus:border-[#D3FB52]/50 transition-all"
            />
          </div>

          {/* Preferred contact time - Optional */}
          <div>
            <label htmlFor="preferredTime" className="block text-sm font-medium text-gray-300 mb-1.5">
              Horario preferido de contacto <span className="text-gray-500 text-xs">(opcional)</span>
            </label>
            <select
              id="preferredTime"
              value={preferredTime}
              onChange={(e) => setPreferredTime(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-[#D3FB52]/50 focus:border-[#D3FB52]/50 transition-all appearance-none"
            >
              <option value="" className="bg-gray-900">Sin preferencia</option>
              <option value="Manana (9am - 12pm)" className="bg-gray-900">Manana (9am - 12pm)</option>
              <option value="Tarde (12pm - 5pm)" className="bg-gray-900">Tarde (12pm - 5pm)</option>
              <option value="Noche (5pm - 9pm)" className="bg-gray-900">Noche (5pm - 9pm)</option>
            </select>
          </div>

          {/* Error */}
          {error && (
            <p className="text-red-400 text-sm text-center">{error}</p>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={!email.trim() || isSubmitting}
            className="w-full py-3.5 px-6 rounded-xl font-semibold text-black bg-[#D3FB52] hover:bg-[#c5ed44] disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 shadow-lg shadow-[#D3FB52]/20 hover:shadow-[#D3FB52]/30 active:scale-[0.98]"
          >
            {isSubmitting ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Enviando...
              </span>
            ) : (
              'Enviar mis datos'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
