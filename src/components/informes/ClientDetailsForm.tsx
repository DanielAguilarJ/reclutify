'use client';

import { useState } from 'react';

interface ClientDetailsFormProps {
  onSubmit: (data: {
    clientName: string;
    clientAge?: number;
    clientOccupation?: string;
    courseFor?: string;
  }) => void;
  courseName?: string;
}

const COURSE_FOR_OPTIONS = [
  'Para mi',
  'Para mi hijo/a',
  'Para mi empresa',
];

export default function ClientDetailsForm({ onSubmit, courseName }: ClientDetailsFormProps) {
  const [clientName, setClientName] = useState('');
  const [clientAge, setClientAge] = useState('');
  const [clientOccupation, setClientOccupation] = useState('');
  const [courseFor, setCourseFor] = useState('');
  const [customCourseFor, setCustomCourseFor] = useState('');
  const [isCustom, setIsCustom] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientName.trim()) return;

    const finalCourseFor = isCustom ? customCourseFor : courseFor;

    onSubmit({
      clientName: clientName.trim(),
      clientAge: clientAge ? parseInt(clientAge, 10) : undefined,
      clientOccupation: clientOccupation.trim() || undefined,
      courseFor: finalCourseFor.trim() || undefined,
    });
  };

  const handleCourseForSelect = (option: string) => {
    if (option === '__custom__') {
      setIsCustom(true);
      setCourseFor('');
    } else {
      setIsCustom(false);
      setCourseFor(option);
      setCustomCourseFor('');
    }
  };

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="text-center mb-8">
        <div className="w-12 h-12 rounded-full bg-[#D3FB52]/20 flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6 text-[#D3FB52]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">Antes de comenzar</h2>
        {courseName && (
          <p className="text-gray-400 text-sm">
            Sesion informativa: <span className="text-[#D3FB52] font-medium">{courseName}</span>
          </p>
        )}
        <p className="text-gray-400 text-sm mt-1">
          Cuentanos un poco sobre ti para personalizar tu experiencia
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Name - Required */}
        <div>
          <label htmlFor="clientName" className="block text-sm font-medium text-gray-300 mb-1.5">
            Tu nombre <span className="text-[#D3FB52]">*</span>
          </label>
          <input
            id="clientName"
            type="text"
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
            placeholder="Ej: Maria Garcia"
            required
            className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#D3FB52]/50 focus:border-[#D3FB52]/50 transition-all"
          />
        </div>

        {/* Age - Optional */}
        <div>
          <label htmlFor="clientAge" className="block text-sm font-medium text-gray-300 mb-1.5">
            Edad <span className="text-gray-500 text-xs">(opcional)</span>
          </label>
          <input
            id="clientAge"
            type="number"
            min={10}
            max={99}
            value={clientAge}
            onChange={(e) => setClientAge(e.target.value)}
            placeholder="Ej: 25"
            className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#D3FB52]/50 focus:border-[#D3FB52]/50 transition-all"
          />
        </div>

        {/* Occupation - Optional */}
        <div>
          <label htmlFor="clientOccupation" className="block text-sm font-medium text-gray-300 mb-1.5">
            Ocupacion <span className="text-gray-500 text-xs">(opcional)</span>
          </label>
          <input
            id="clientOccupation"
            type="text"
            value={clientOccupation}
            onChange={(e) => setClientOccupation(e.target.value)}
            placeholder="Ej: Estudiante, Profesional, Emprendedor"
            className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#D3FB52]/50 focus:border-[#D3FB52]/50 transition-all"
          />
        </div>

        {/* Course For - Optional */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1.5">
            Este curso es para... <span className="text-gray-500 text-xs">(opcional)</span>
          </label>
          <div className="grid grid-cols-2 gap-2 mb-2">
            {COURSE_FOR_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => handleCourseForSelect(option)}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-all border ${
                  courseFor === option && !isCustom
                    ? 'bg-[#D3FB52]/20 border-[#D3FB52]/50 text-[#D3FB52]'
                    : 'bg-white/5 border-white/10 text-gray-300 hover:bg-white/10 hover:border-white/20'
                }`}
              >
                {option}
              </button>
            ))}
            <button
              type="button"
              onClick={() => handleCourseForSelect('__custom__')}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-all border ${
                isCustom
                  ? 'bg-[#D3FB52]/20 border-[#D3FB52]/50 text-[#D3FB52]'
                  : 'bg-white/5 border-white/10 text-gray-300 hover:bg-white/10 hover:border-white/20'
              }`}
            >
              Otro...
            </button>
          </div>
          {isCustom && (
            <input
              type="text"
              value={customCourseFor}
              onChange={(e) => setCustomCourseFor(e.target.value)}
              placeholder="Especifica para quien es..."
              className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#D3FB52]/50 focus:border-[#D3FB52]/50 transition-all"
            />
          )}
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={!clientName.trim()}
          className="w-full py-3.5 px-6 rounded-xl font-semibold text-black bg-[#D3FB52] hover:bg-[#c5ed44] disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 shadow-lg shadow-[#D3FB52]/20 hover:shadow-[#D3FB52]/30 active:scale-[0.98]"
        >
          Iniciar Sesion
        </button>
      </form>
    </div>
  );
}
