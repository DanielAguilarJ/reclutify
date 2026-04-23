'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Ticket, Copy, Check, Plus, Clock, CheckCircle2, XCircle, Link2 } from 'lucide-react';
import { useTicketStore } from '@/store/ticketStore';
import { useAdminStore } from '@/store/adminStore';
import { useAppStore } from '@/store/appStore';
import { useTickets } from '@/hooks/useTickets';
import { useRoles } from '@/hooks/useRoles';

export default function TicketsPage() {
  const { tickets, addTicket, syncAddTicket } = useTicketStore();
  const { roles } = useAdminStore();
  const { language } = useAppStore();

  // Sincronizar con Supabase al montar
  useTickets();
  useRoles();
  
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [selectedRoleId, setSelectedRoleId] = useState(roles[0]?.id || '');
  const [selectedLang, setSelectedLang] = useState<'en' | 'es'>('es');
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [justCreated, setJustCreated] = useState<string | null>(null);

  const es = language === 'es';

  const handleGenerate = () => {
    if (roles.length === 0) {
      alert(es ? 'Debes crear un puesto primero en /admin/create-role' : 'You must create a role first in /admin/create-role');
      return;
    }
    const finalRoleId = selectedRoleId || roles[0]?.id;
    if (!finalRoleId) return;
    
    setIsSending(true);
    
    const finalName = name.trim() || (email.trim() ? email.trim().split('@')[0] : 'Candidato');

    // Generar el ticket y mostrar éxito de inmediato en la UI
    const ticket = addTicket(finalName, finalRoleId, selectedLang);
    setJustCreated(ticket.token);

    // Sincronizar con Supabase en segundo plano
    syncAddTicket(ticket);
    
    let dParam = '';
    const role = roles.find((r) => r.id === ticket.roleId);
    if (role) {
      const payload = JSON.stringify({ t: ticket, r: role });
      dParam = `?d=${typeof window !== 'undefined' ? btoa(unescape(encodeURIComponent(payload))) : ''}`;
    }
    const url = `${window.location.origin}/interview/t/${ticket.token}${dParam}`;

    // Disparar la petición al API en segundo plano
    if (email.trim()) {
      fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          candidateName: finalName,
          roleTitle: role?.title,
          link: url,
          language: selectedLang
        }),
      })
      .then(async (res) => {
        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          console.error('API Error:', errorData);
          alert(es ? 'Hubo un error silencioso de servidor al enviar el correo (Brevo API), pero el link ya está generado y activo.' : 'Email delivery failed in the background. The ticket/link is still valid.');
        } else {
          alert(es ? 'Ticket generado y enviado por correo a: ' + email.trim() : 'Ticket generated and emailed to: ' + email.trim());
        }
      })
      .catch((error) => {
        console.error('Error sending email:', error);
      })
      .finally(() => {
        setIsSending(false);
      });
    } else {
      setIsSending(false);
    }

    setName('');
    setEmail('');
    setTimeout(() => setJustCreated(null), 3000);
  };

  const copyLink = (token: string) => {
    const ticket = tickets.find(t => t.token === token);
    const role = roles.find(r => r.id === ticket?.roleId);
    let dParam = '';
    
    // Cross-device MVP trick: encode role and ticket directly in the URL 
    if (ticket && role) {
      const payload = JSON.stringify({ t: ticket, r: role });
      dParam = `?d=${typeof window !== 'undefined' ? btoa(unescape(encodeURIComponent(payload))) : ''}`;
    }
    
    const url = `${window.location.origin}/interview/t/${token}${dParam}`;
    navigator.clipboard.writeText(url);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2000);
  };

  const getStatus = (ticket: { used: boolean; expiresAt: number }) => {
    if (ticket.used) return 'used';
    // eslint-disable-next-line react-hooks/purity
    if (Date.now() > ticket.expiresAt) return 'expired';
    return 'active';
  };

  const statusConfig = {
    active: {
      label: es ? 'Activo' : 'Active',
      className: 'bg-success/10 text-success border-success/20',
      icon: CheckCircle2,
    },
    used: {
      label: es ? 'Usado' : 'Used',
      className: 'bg-muted/10 text-muted border-muted/20',
      icon: Check,
    },
    expired: {
      label: es ? 'Expirado' : 'Expired',
      className: 'bg-danger/10 text-danger border-danger/20',
      icon: XCircle,
    },
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">
            {es ? 'Tickets de Entrevista' : 'Interview Tickets'}
          </h1>
          <p className="text-sm text-muted mt-1">
            {es
              ? 'Genera links únicos de un solo uso para cada candidato. Expiran en 24 horas.'
              : 'Generate unique, one-time-use links for each candidate. They expire in 24 hours.'}
          </p>
        </div>
      </div>

      {/* Generate Ticket Form */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-card rounded-2xl shadow-sm border border-border/50 p-6 mb-8"
      >
        <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
          <Ticket className="h-4 w-4 text-primary" />
          {es ? 'Generar Nuevo Ticket' : 'Generate New Ticket'}
        </h2>

        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={es ? 'Nombre del candidato' : 'Candidate name'}
            className="flex-1 px-4 py-2.5 rounded-xl border border-border/50 bg-background text-sm text-foreground placeholder:text-muted/50 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={es ? 'Correo (opcional)' : 'Email (optional)'}
            className="flex-1 px-4 py-2.5 rounded-xl border border-border/50 bg-background text-sm text-foreground placeholder:text-muted/50 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
          <select
            value={selectedRoleId}
            onChange={(e) => setSelectedRoleId(e.target.value)}
            className="px-4 py-2.5 rounded-xl border border-border/50 bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          >
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.title}
              </option>
            ))}
          </select>
          <select
            value={selectedLang}
            onChange={(e) => setSelectedLang(e.target.value as 'en' | 'es')}
            className="px-4 py-2.5 rounded-xl border border-border/50 bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          >
            <option value="es">🇲🇽 Español</option>
            <option value="en">🇺🇸 English</option>
          </select>
          <button
            onClick={handleGenerate}
            disabled={(!name.trim() && !email.trim()) || isSending}
            className="flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            {isSending ? (
              <div className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            {es ? (isSending ? 'Enviando...' : 'Generar') : (isSending ? 'Sending...' : 'Generate')}
          </button>
        </div>
      </motion.div>

      {/* Tickets Table */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-card rounded-2xl shadow-sm border border-border/50 overflow-hidden"
      >
        <div className="px-6 py-4 border-b border-border/50 bg-muted/5">
          <h3 className="text-sm font-medium text-foreground">
            {es ? 'Todos los Tickets' : 'All Tickets'} ({tickets.length})
          </h3>
        </div>

        {tickets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted">
            <Ticket className="h-10 w-10 mb-3 opacity-30" />
            <p className="text-sm">{es ? 'No hay tickets generados aún.' : 'No tickets generated yet.'}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/30 text-muted text-xs uppercase tracking-wider">
                  <th className="text-left px-6 py-3 font-medium">{es ? 'Nombre' : 'Name'}</th>
                  <th className="text-left px-6 py-3 font-medium">{es ? 'Puesto' : 'Role'}</th>
                  <th className="text-left px-6 py-3 font-medium">{es ? 'Idioma' : 'Language'}</th>
                  <th className="text-left px-6 py-3 font-medium">Token</th>
                  <th className="text-left px-6 py-3 font-medium">{es ? 'Expira' : 'Expires'}</th>
                  <th className="text-left px-6 py-3 font-medium">{es ? 'Estado' : 'Status'}</th>
                  <th className="text-right px-6 py-3 font-medium">{es ? 'Acción' : 'Action'}</th>
                </tr>
              </thead>
              <tbody>
                <AnimatePresence>
                  {tickets.map((ticket) => {
                    const status = getStatus(ticket);
                    const config = statusConfig[status];
                    const role = roles.find((r) => r.id === ticket.roleId);
                    const StatusIcon = config.icon;

                    return (
                      <motion.tr
                        key={ticket.id}
                        initial={{ opacity: 0, backgroundColor: justCreated === ticket.token ? 'rgba(99,102,241,0.1)' : 'transparent' }}
                        animate={{ opacity: 1, backgroundColor: 'transparent' }}
                        transition={{ duration: 1 }}
                        className="border-b border-border/20 hover:bg-muted/5 transition-colors"
                      >
                        <td className="px-6 py-4 font-medium text-foreground">
                          {ticket.candidateName}
                        </td>
                        <td className="px-6 py-4 text-muted">
                          {role?.title || ticket.roleId}
                        </td>
                        <td className="px-6 py-4 text-muted">
                          {ticket.language === 'es' ? '🇲🇽 ES' : '🇺🇸 EN'}
                        </td>
                        <td className="px-6 py-4">
                          <code className="px-2.5 py-1 rounded-lg bg-primary/5 text-primary font-mono text-xs font-bold tracking-wider">
                            {ticket.token}
                          </code>
                        </td>
                        <td className="px-6 py-4 text-muted">
                          <div className="flex items-center gap-1.5">
                            <Clock className="h-3.5 w-3.5" />
                            {new Date(ticket.expiresAt).toLocaleString(es ? 'es-MX' : 'en-US', {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${config.className}`}>
                            <StatusIcon className="h-3 w-3" />
                            {config.label}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button
                            onClick={() => copyLink(ticket.token)}
                            disabled={status !== 'active'}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                          >
                            {copiedToken === ticket.token ? (
                              <>
                                <Check className="h-3 w-3" />
                                {es ? '¡Copiado!' : 'Copied!'}
                              </>
                            ) : (
                              <>
                                <Link2 className="h-3 w-3" />
                                {es ? 'Copiar Link' : 'Copy Link'}
                              </>
                            )}
                          </button>
                        </td>
                      </motion.tr>
                    );
                  })}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        )}
      </motion.div>
    </div>
  );
}
