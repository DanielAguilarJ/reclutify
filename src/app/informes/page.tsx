'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';

interface CourseCard {
  id: string;
  name: string;
  description: string;
  modality: 'presencial' | 'online' | 'hibrido';
  durationInfo: string;
  targetAudience: string;
}

export default function InformesPage() {
  const [courses, setCourses] = useState<CourseCard[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    const fetchCourses = async () => {
      try {
        const supabase = createClient();
        const { data, error: fetchError } = await supabase
          .from('courses')
          .select('id, name, description, modality, duration_info, target_audience')
          .eq('is_active', true)
          .order('created_at', { ascending: false });

        if (fetchError) throw fetchError;

        const mapped: CourseCard[] = (data || []).map((c) => ({
          id: c.id,
          name: c.name,
          description: c.description || '',
          modality: c.modality || 'presencial',
          durationInfo: c.duration_info || '',
          targetAudience: c.target_audience || '',
        }));

        setCourses(mapped);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setIsLoading(false);
      }
    };

    fetchCourses();
  }, []);

  const getModalityLabel = (modality: string) => {
    const labels: Record<string, string> = {
      presencial: 'Presencial',
      online: 'En linea',
      hibrido: 'Hibrido',
    };
    return labels[modality] || modality;
  };

  const getModalityIcon = (modality: string) => {
    switch (modality) {
      case 'online':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        );
      case 'hibrido':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
          </svg>
        );
      default:
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        );
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-950 via-gray-900 to-gray-950">
      {/* Header */}
      <header className="border-b border-white/5">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[#D3FB52] flex items-center justify-center">
              <span className="text-sm font-black text-black">R</span>
            </div>
            <span className="text-lg font-semibold text-white">Reclutify</span>
          </div>
          <span className="text-sm text-gray-500 hidden sm:inline">Sesiones Informativas</span>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-12 pb-8">
        <div className="text-center max-w-2xl mx-auto">
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            Conoce nuestros cursos
          </h1>
          <p className="text-gray-400 text-lg">
            Inicia una sesion informativa con nuestra IA y resuelve todas tus dudas en tiempo real.
          </p>
        </div>
      </section>

      {/* Content */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 pb-16">
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="rounded-2xl bg-white/5 border border-white/5 p-6 animate-pulse">
                <div className="h-5 w-2/3 bg-white/10 rounded mb-3" />
                <div className="h-4 w-full bg-white/5 rounded mb-2" />
                <div className="h-4 w-4/5 bg-white/5 rounded mb-4" />
                <div className="flex gap-2">
                  <div className="h-6 w-20 bg-white/5 rounded-full" />
                  <div className="h-6 w-16 bg-white/5 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <p className="text-gray-400">No pudimos cargar los cursos. Intenta de nuevo mas tarde.</p>
          </div>
        ) : courses.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <p className="text-gray-400">No hay cursos disponibles en este momento.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {courses.map((course) => (
              <button
                key={course.id}
                onClick={() => router.push(`/informes/${course.id}`)}
                className="group text-left rounded-2xl bg-white/[0.03] border border-white/10 p-6 hover:border-[#D3FB52]/30 hover:bg-[#D3FB52]/[0.03] transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-[#D3FB52]/30"
              >
                <h3 className="text-lg font-semibold text-white mb-2 group-hover:text-[#D3FB52] transition-colors">
                  {course.name}
                </h3>
                <p className="text-gray-400 text-sm mb-4 line-clamp-3">
                  {course.description}
                </p>

                <div className="flex flex-wrap gap-2">
                  {/* Modality badge */}
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-white/5 text-gray-300 border border-white/10">
                    {getModalityIcon(course.modality)}
                    {getModalityLabel(course.modality)}
                  </span>

                  {/* Duration badge */}
                  {course.durationInfo && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-white/5 text-gray-300 border border-white/10">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      {course.durationInfo}
                    </span>
                  )}
                </div>

                {/* Arrow indicator */}
                <div className="mt-4 flex items-center gap-1 text-[#D3FB52] opacity-0 group-hover:opacity-100 transition-opacity">
                  <span className="text-sm font-medium">Iniciar sesion informativa</span>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
