'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Users, TrendingUp, Award, BookOpen, Settings, Eye, Activity } from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { useTrainingAdminStore } from '@/store/trainingAdminStore';

export default function TrainingDashboardPage() {
  const { language } = useAppStore();
  const { employees, modules, loading, fetchTrainingData } = useTrainingAdminStore();

  useEffect(() => {
    fetchTrainingData();
  }, [fetchTrainingData]);

  // KPI calculations
  const totalEmployees = employees.length;
  const averageProgress = totalEmployees > 0
    ? Math.round(employees.reduce((sum, emp) => sum + emp.overallProgress, 0) / totalEmployees)
    : 0;
  const completionRate = totalEmployees > 0
    ? Math.round((employees.filter(emp => emp.status === 'completed').length / totalEmployees) * 100)
    : 0;
  const activeModules = modules.length;

  // Recent activity: last 5 employees sorted by progress (active ones first)
  const recentActivity = [...employees]
    .filter(emp => emp.status === 'active' || emp.status === 'completed')
    .sort((a, b) => b.overallProgress - a.overallProgress)
    .slice(0, 5);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-warning/10 text-warning">
            {language === 'es' ? 'Activo' : 'Active'}
          </span>
        );
      case 'completed':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-success/10 text-success">
            {language === 'es' ? 'Completado' : 'Completed'}
          </span>
        );
      case 'paused':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-muted/20 text-muted">
            {language === 'es' ? 'Pausado' : 'Paused'}
          </span>
        );
      case 'not_started':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-500/10 text-blue-600">
            {language === 'es' ? 'Sin Iniciar' : 'Not Started'}
          </span>
        );
      default:
        return null;
    }
  };

  const getProgressColor = (progress: number) => {
    if (progress >= 80) return 'bg-success';
    if (progress >= 50) return 'bg-warning';
    if (progress >= 25) return 'bg-blue-500';
    return 'bg-muted';
  };

  if (loading) {
    return (
      <div className="animate-in fade-in duration-500 p-6 space-y-6">
        {/* Header skeleton */}
        <div className="flex items-center justify-between">
          <div>
            <div className="h-7 w-64 bg-border/30 rounded-lg animate-pulse" />
            <div className="h-4 w-48 bg-border/30 rounded-lg animate-pulse mt-2" />
          </div>
          <div className="h-10 w-44 bg-border/30 rounded-xl animate-pulse" />
        </div>
        {/* KPI skeletons */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="p-5 rounded-2xl bg-card border border-border/50 shadow-sm">
              <div className="h-4 w-24 bg-border/30 rounded animate-pulse mb-3" />
              <div className="h-8 w-16 bg-border/30 rounded animate-pulse" />
            </div>
          ))}
        </div>
        {/* Table skeleton */}
        <div className="bg-card rounded-2xl shadow-sm border border-border/50 overflow-hidden p-5">
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-12 bg-border/30 rounded-lg animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-in fade-in duration-500 p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground mb-1">
            {language === 'es' ? 'Centro de Capacitacion' : 'Training Center'}
          </h1>
          <p className="text-sm text-muted">
            {language === 'es'
              ? 'Administra programas de entrenamiento y supervisa el progreso de empleados'
              : 'Manage training programs and monitor employee progress'}
          </p>
        </div>
        <Link
          href="/admin/training/configure"
          className="inline-flex items-center gap-2 bg-primary hover:bg-primary-hover text-white font-medium py-2.5 px-4 rounded-xl transition-all"
        >
          <Settings className="h-4 w-4" />
          {language === 'es' ? 'Configurar Programa' : 'Configure Program'}
        </Link>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl bg-card border border-border/50 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-xl bg-primary-light">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <span className="text-sm text-muted">
              {language === 'es' ? 'Empleados en Training' : 'Employees in Training'}
            </span>
          </div>
          <p className="text-2xl font-bold text-foreground">{totalEmployees}</p>
        </div>

        <div className="p-5 rounded-2xl bg-card border border-border/50 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-xl bg-primary-light">
              <TrendingUp className="h-5 w-5 text-primary" />
            </div>
            <span className="text-sm text-muted">
              {language === 'es' ? 'Progreso Promedio' : 'Average Progress'}
            </span>
          </div>
          <p className="text-2xl font-bold text-foreground">{averageProgress}%</p>
        </div>

        <div className="p-5 rounded-2xl bg-card border border-border/50 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-xl bg-primary-light">
              <Award className="h-5 w-5 text-primary" />
            </div>
            <span className="text-sm text-muted">
              {language === 'es' ? 'Tasa de Completitud' : 'Completion Rate'}
            </span>
          </div>
          <p className="text-2xl font-bold text-foreground">{completionRate}%</p>
        </div>

        <div className="p-5 rounded-2xl bg-card border border-border/50 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-xl bg-primary-light">
              <BookOpen className="h-5 w-5 text-primary" />
            </div>
            <span className="text-sm text-muted">
              {language === 'es' ? 'Modulos Activos' : 'Active Modules'}
            </span>
          </div>
          <p className="text-2xl font-bold text-foreground">{activeModules}</p>
        </div>
      </div>

      {/* Employees Table */}
      <div className="bg-card rounded-2xl shadow-sm border border-border/50 overflow-hidden">
        <div className="p-5 border-b border-border/50">
          <h2 className="text-lg font-semibold text-foreground">
            {language === 'es' ? 'Empleados en Entrenamiento' : 'Training Employees'}
          </h2>
        </div>

        {employees.length === 0 ? (
          <div className="p-12 flex flex-col items-center justify-center border-2 border-dashed border-border/50 m-5 rounded-xl">
            <div className="p-4 rounded-full bg-primary-light mb-4">
              <Users className="h-8 w-8 text-primary" />
            </div>
            <p className="text-foreground font-medium mb-1">
              {language === 'es' ? 'No hay empleados en entrenamiento' : 'No employees in training'}
            </p>
            <p className="text-sm text-muted text-center max-w-md">
              {language === 'es'
                ? 'Los empleados apareceran aqui cuando sean contratados desde el pipeline y asignados a un programa de capacitacion.'
                : 'Employees will appear here when they are hired from the pipeline and assigned to a training program.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border/50">
                  <th className="text-left text-xs font-medium text-muted uppercase tracking-wider px-5 py-3">
                    {language === 'es' ? 'Nombre' : 'Name'}
                  </th>
                  <th className="text-left text-xs font-medium text-muted uppercase tracking-wider px-5 py-3">
                    {language === 'es' ? 'Puesto' : 'Role'}
                  </th>
                  <th className="text-left text-xs font-medium text-muted uppercase tracking-wider px-5 py-3">
                    {language === 'es' ? 'Progreso' : 'Progress'}
                  </th>
                  <th className="text-left text-xs font-medium text-muted uppercase tracking-wider px-5 py-3">
                    Score
                  </th>
                  <th className="text-left text-xs font-medium text-muted uppercase tracking-wider px-5 py-3">
                    {language === 'es' ? 'Estado' : 'Status'}
                  </th>
                  <th className="text-left text-xs font-medium text-muted uppercase tracking-wider px-5 py-3">
                    {language === 'es' ? 'Fecha Contratacion' : 'Hired Date'}
                  </th>
                  <th className="text-right text-xs font-medium text-muted uppercase tracking-wider px-5 py-3">
                    {language === 'es' ? 'Acciones' : 'Actions'}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {employees.map((employee) => (
                  <tr key={employee.id} className="hover:bg-background/50 transition-colors">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-primary-light flex items-center justify-center">
                          <span className="text-xs font-semibold text-primary">
                            {employee.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground">{employee.name}</p>
                          <p className="text-xs text-muted">{employee.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <span className="text-sm text-foreground">{employee.roleTitle || '—'}</span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-24 h-2 rounded-full bg-border/30 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${getProgressColor(employee.overallProgress)}`}
                            style={{ width: `${employee.overallProgress}%` }}
                          />
                        </div>
                        <span className="text-xs text-muted font-medium">{employee.overallProgress}%</span>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <span className="text-sm font-medium text-foreground">
                        {employee.overallScore != null ? `${employee.overallScore}%` : '—'}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      {getStatusBadge(employee.status)}
                    </td>
                    <td className="px-5 py-4">
                      <span className="text-sm text-muted">
                        {new Date(employee.hiredAt).toLocaleDateString(language === 'es' ? 'es-MX' : 'en-US', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <Link
                        href={`/admin/training/progress/${employee.id}`}
                        className="inline-flex items-center gap-1.5 text-sm text-primary hover:text-primary-hover font-medium transition-colors"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        {language === 'es' ? 'Ver Progreso' : 'View Progress'}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Quick Stats - Recent Activity */}
      {recentActivity.length > 0 && (
        <div className="p-5 rounded-2xl bg-card border border-border/50 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="h-5 w-5 text-primary" />
            <h3 className="text-base font-semibold text-foreground">
              {language === 'es' ? 'Actividad Reciente' : 'Recent Activity'}
            </h3>
          </div>
          <div className="space-y-3">
            {recentActivity.map((emp) => (
              <div key={emp.id} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                <div className="flex items-center gap-3">
                  <div className="h-7 w-7 rounded-full bg-primary-light flex items-center justify-center">
                    <span className="text-[10px] font-semibold text-primary">
                      {emp.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{emp.name}</p>
                    <p className="text-xs text-muted">{emp.roleTitle || ''}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-20 h-1.5 rounded-full bg-border/30 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${getProgressColor(emp.overallProgress)}`}
                      style={{ width: `${emp.overallProgress}%` }}
                    />
                  </div>
                  <span className="text-xs font-medium text-muted">{emp.overallProgress}%</span>
                  {getStatusBadge(emp.status)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
