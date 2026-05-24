'use client';

import { useEffect, useState } from 'react';
import { useCoachStore } from '@/store/coachStore';
import { useAppStore } from '@/store/appStore';
import { BookOpen, ToggleLeft, ToggleRight, Trash2, ExternalLink, Copy, Check } from 'lucide-react';
import Link from 'next/link';

export default function CoursesPage() {
  const { language } = useAppStore();
  const { courses, fetchFromSupabase, toggleCourseActive, removeCourse } = useCoachStore();
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    fetchFromSupabase();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const copyLink = (courseId: string) => {
    const url = `${window.location.origin}/informes/${courseId}`;
    navigator.clipboard.writeText(url);
    setCopiedId(courseId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {language === 'es' ? 'Mis Cursos' : 'My Courses'}
          </h1>
          <p className="text-sm text-muted mt-1">
            {language === 'es'
              ? 'Gestiona tus cursos y productos. Activa los que quieras hacer publicos.'
              : 'Manage your courses and products. Activate those you want to make public.'}
          </p>
        </div>
        <Link
          href="/coach/create-course"
          className="bg-[#D3FB52] hover:bg-[#c4ec43] text-black font-medium text-sm px-4 py-2.5 rounded-xl transition-colors"
        >
          + {language === 'es' ? 'Nuevo Curso' : 'New Course'}
        </Link>
      </div>

      {courses.length === 0 ? (
        <div className="bg-card border border-border/50 rounded-2xl p-12 text-center">
          <BookOpen className="h-10 w-10 text-muted mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-foreground mb-2">
            {language === 'es' ? 'No tienes cursos aun' : 'No courses yet'}
          </h3>
          <p className="text-sm text-muted mb-6 max-w-sm mx-auto">
            {language === 'es'
              ? 'Crea tu primer curso para que la IA pueda informar a tus clientes de forma interactiva.'
              : 'Create your first course so AI can inform your clients interactively.'}
          </p>
          <Link
            href="/coach/create-course"
            className="inline-flex bg-[#D3FB52] hover:bg-[#c4ec43] text-black font-medium text-sm px-5 py-2.5 rounded-xl transition-colors"
          >
            {language === 'es' ? 'Crear Primer Curso' : 'Create First Course'}
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {courses.map((course) => (
            <div key={course.id} className="bg-card border border-border/50 rounded-2xl p-5 flex flex-col">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-foreground truncate">{course.name}</h3>
                  <p className="text-xs text-muted mt-0.5">
                    {course.modality} · {course.durationInfo || 'Sin duracion'}
                  </p>
                </div>
                <button
                  onClick={() => toggleCourseActive(course.id)}
                  className="shrink-0 ml-2"
                  title={course.isActive ? 'Desactivar' : 'Activar'}
                >
                  {course.isActive ? (
                    <ToggleRight className="h-6 w-6 text-[#D3FB52]" />
                  ) : (
                    <ToggleLeft className="h-6 w-6 text-muted" />
                  )}
                </button>
              </div>

              <p className="text-xs text-muted line-clamp-2 mb-4 flex-1">
                {course.description || 'Sin descripcion'}
              </p>

              <div className="flex items-center gap-2 text-xs text-muted mb-3">
                <span className={`px-2 py-0.5 rounded-full ${course.isActive ? 'bg-green-500/10 text-green-500' : 'bg-muted/10 text-muted'}`}>
                  {course.isActive ? 'Activo' : 'Inactivo'}
                </span>
                <span>{course.topics.length} temas</span>
              </div>

              <div className="flex items-center gap-2 pt-3 border-t border-border/30">
                {course.isActive && (
                  <>
                    <button
                      onClick={() => copyLink(course.id)}
                      className="flex items-center gap-1 text-xs text-muted hover:text-foreground transition-colors"
                      title="Copiar link publico"
                    >
                      {copiedId === course.id ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                      {copiedId === course.id ? 'Copiado' : 'Link'}
                    </button>
                    <a
                      href={`/informes/${course.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-muted hover:text-foreground transition-colors"
                    >
                      <ExternalLink className="h-3 w-3" />
                      Abrir
                    </a>
                  </>
                )}
                <button
                  onClick={() => {
                    if (confirm('Eliminar este curso? Esta accion no se puede deshacer.')) {
                      removeCourse(course.id);
                    }
                  }}
                  className="flex items-center gap-1 text-xs text-red-500/70 hover:text-red-500 transition-colors ml-auto"
                >
                  <Trash2 className="h-3 w-3" />
                  Eliminar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
