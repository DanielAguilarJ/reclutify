'use client';

import { useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useInfoSessionStore } from '@/store/infoSessionStore';
import ClientDetailsForm from '@/components/informes/ClientDetailsForm';
import InfoSessionRoom from '@/components/informes/InfoSessionRoom';
import ClosingPresential from '@/components/informes/ClosingPresential';
import ClosingRemote from '@/components/informes/ClosingRemote';

export default function InfoSessionPage() {
  const params = useParams();
  const courseId = params.courseId as string;

  const {
    phase,
    course,
    isLoading,
    error,
    closingMode,
    loadCourse,
    setPhase,
    setClientDetails,
    createSession,
    startTimer,
    reset,
  } = useInfoSessionStore();

  // Load course on mount
  useEffect(() => {
    if (courseId) {
      reset();
      loadCourse(courseId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  // Once course is loaded, move to details phase
  useEffect(() => {
    if (course && phase === 'select') {
      setPhase('details');
    }
  }, [course, phase, setPhase]);

  const handleDetailsSubmit = async (data: {
    clientName: string;
    clientAge?: number;
    clientOccupation?: string;
    courseFor?: string;
  }) => {
    setClientDetails({
      clientName: data.clientName,
      clientAge: data.clientAge ?? null,
      clientOccupation: data.clientOccupation,
      courseFor: data.courseFor,
    });

    // Create session in Supabase
    const sessionId = await createSession();
    if (sessionId) {
      startTimer();
      setPhase('session');
    }
  };

  // Loading state
  if (isLoading && !course) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-950 via-gray-900 to-gray-950 flex items-center justify-center">
        <div className="text-center">
          <div className="relative w-16 h-16 mx-auto mb-6">
            <div className="absolute inset-0 rounded-full border-2 border-[#D3FB52]/20" />
            <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-[#D3FB52] animate-spin" />
          </div>
          <p className="text-gray-400 text-sm">Cargando informacion del curso...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-950 via-gray-900 to-gray-950 flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Curso no encontrado</h2>
          <p className="text-gray-400 mb-6">{error}</p>
          <a
            href="/informes"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white hover:bg-white/10 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Volver al catalogo
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-950 via-gray-900 to-gray-950">
      {/* Minimal header for session pages */}
      <header className="border-b border-white/5">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-[#D3FB52] flex items-center justify-center">
              <span className="text-xs font-black text-black">R</span>
            </div>
            <span className="text-sm font-medium text-gray-400">Sesion Informativa</span>
          </div>
          {course && (
            <span className="text-sm text-gray-500 truncate max-w-[200px]">{course.name}</span>
          )}
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-4xl mx-auto h-[calc(100vh-57px)]">
        {phase === 'details' && (
          <div className="flex items-center justify-center min-h-full px-4 py-12">
            <ClientDetailsForm
              onSubmit={handleDetailsSubmit}
              courseName={course?.name}
            />
          </div>
        )}

        {phase === 'session' && (
          <InfoSessionRoom />
        )}

        {phase === 'closing' && closingMode === 'presential' && (
          <div className="flex items-center justify-center min-h-full">
            <ClosingPresential />
          </div>
        )}

        {phase === 'closing' && closingMode === 'remote' && (
          <div className="flex items-center justify-center min-h-full">
            <ClosingRemote />
          </div>
        )}
      </main>
    </div>
  );
}
