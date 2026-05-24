'use client';

import { useEffect, useState } from 'react';
import { useCoachStore } from '@/store/coachStore';
import { useAppStore } from '@/store/appStore';
import { Users, Mail, Phone, Calendar, Download } from 'lucide-react';

export default function LeadsPage() {
  const { language } = useAppStore();
  const { leads, fetchLeads } = useCoachStore();
  const [filter, setFilter] = useState<'all' | 'converted' | 'pending' | 'not_converted'>('all');

  useEffect(() => {
    fetchLeads();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredLeads = leads.filter(lead => {
    if (filter === 'all') return true;
    return lead.conversionResult === filter;
  });

  const exportCSV = () => {
    const headers = ['Nombre', 'Email', 'Telefono', 'Edad', 'Ocupacion', 'Curso Para', 'Estado', 'Modo Cierre', 'Fecha'];
    const rows = filteredLeads.map(l => [
      l.clientName,
      l.clientEmail,
      l.clientPhone,
      l.clientAge?.toString() || '',
      l.clientOccupation,
      l.courseFor,
      l.conversionResult,
      l.closingMode || '',
      new Date(l.createdAt).toLocaleDateString(),
    ]);

    const csv = [headers, ...rows].map(r => r.map(cell => `"${cell}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `prospectos-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {language === 'es' ? 'Prospectos' : 'Leads'}
          </h1>
          <p className="text-sm text-muted mt-1">
            {language === 'es'
              ? 'Datos de clientes que participaron en sesiones de informes.'
              : 'Client data from information sessions.'}
          </p>
        </div>
        <button
          onClick={exportCSV}
          disabled={filteredLeads.length === 0}
          className="flex items-center gap-2 bg-card border border-border/50 hover:border-border text-sm font-medium px-4 py-2.5 rounded-xl transition-colors disabled:opacity-50"
        >
          <Download className="h-4 w-4" />
          Exportar CSV
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        {(['all', 'converted', 'pending', 'not_converted'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filter === f
                ? 'bg-[#D3FB52]/10 text-[#D3FB52] border border-[#D3FB52]/20'
                : 'bg-card border border-border/50 text-muted hover:text-foreground'
            }`}
          >
            {f === 'all' && (language === 'es' ? 'Todos' : 'All')}
            {f === 'converted' && (language === 'es' ? 'Convertidos' : 'Converted')}
            {f === 'pending' && (language === 'es' ? 'Pendientes' : 'Pending')}
            {f === 'not_converted' && (language === 'es' ? 'No convertidos' : 'Not Converted')}
          </button>
        ))}
      </div>

      {/* Leads Count */}
      <p className="text-xs text-muted">{filteredLeads.length} prospectos</p>

      {filteredLeads.length === 0 ? (
        <div className="bg-card border border-border/50 rounded-2xl p-12 text-center">
          <Users className="h-10 w-10 text-muted mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-foreground mb-2">
            {language === 'es' ? 'Sin prospectos aun' : 'No leads yet'}
          </h3>
          <p className="text-sm text-muted max-w-sm mx-auto">
            {language === 'es'
              ? 'Cuando los clientes completen sesiones de informes, sus datos apareceran aqui.'
              : 'When clients complete information sessions, their data will appear here.'}
          </p>
        </div>
      ) : (
        <div className="bg-card border border-border/50 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/30">
                  <th className="text-left text-xs font-semibold text-muted uppercase tracking-wider px-4 py-3">Nombre</th>
                  <th className="text-left text-xs font-semibold text-muted uppercase tracking-wider px-4 py-3">Contacto</th>
                  <th className="text-left text-xs font-semibold text-muted uppercase tracking-wider px-4 py-3">Perfil</th>
                  <th className="text-left text-xs font-semibold text-muted uppercase tracking-wider px-4 py-3">Estado</th>
                  <th className="text-left text-xs font-semibold text-muted uppercase tracking-wider px-4 py-3">Cierre</th>
                  <th className="text-left text-xs font-semibold text-muted uppercase tracking-wider px-4 py-3">Fecha</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/20">
                {filteredLeads.map((lead) => (
                  <tr key={lead.id} className="hover:bg-background/50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-foreground">{lead.clientName || 'Sin nombre'}</p>
                      <p className="text-xs text-muted">{lead.courseFor && `Para: ${lead.courseFor}`}</p>
                    </td>
                    <td className="px-4 py-3">
                      {lead.clientEmail && (
                        <p className="text-xs text-muted flex items-center gap-1">
                          <Mail className="h-3 w-3" /> {lead.clientEmail}
                        </p>
                      )}
                      {lead.clientPhone && (
                        <p className="text-xs text-muted flex items-center gap-1">
                          <Phone className="h-3 w-3" /> {lead.clientPhone}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-xs text-muted">{lead.clientOccupation || '-'}</p>
                      {lead.clientAge && <p className="text-xs text-muted">{lead.clientAge} anios</p>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        lead.conversionResult === 'converted'
                          ? 'bg-green-500/10 text-green-500'
                          : lead.conversionResult === 'pending'
                          ? 'bg-yellow-500/10 text-yellow-500'
                          : 'bg-red-500/10 text-red-500'
                      }`}>
                        {lead.conversionResult === 'converted' && 'Convertido'}
                        {lead.conversionResult === 'pending' && 'Pendiente'}
                        {lead.conversionResult === 'not_converted' && 'No convertido'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-muted capitalize">
                        {lead.closingMode === 'presential' ? 'Presencial' : lead.closingMode === 'remote' ? 'Remoto' : '-'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-xs text-muted flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {new Date(lead.createdAt).toLocaleDateString()}
                      </p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
