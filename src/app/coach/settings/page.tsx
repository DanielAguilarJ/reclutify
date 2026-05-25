'use client';

import { useState, useEffect } from 'react';
import {
  User,
  Globe,
  Bot,
  Clock,
  Bell,
  FileText,
  Link2,
  Users,
  Save,
  CheckCircle2,
  Loader2,
  Plus,
  X,
  Trash2,
  Info,
  Send,
} from 'lucide-react';
import { useCoachSettingsStore, Integrations } from '@/store/coachSettingsStore';
import { useAppStore } from '@/store/appStore';

// ─── Toggle Component ───

function Toggle({ active, onChange }: { active: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      onClick={onChange}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${
        active ? 'bg-primary' : 'bg-muted/30'
      }`}
    >
      <span
        aria-hidden="true"
        className={`pointer-events-none inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
          active ? 'translate-x-2' : '-translate-x-2'
        }`}
      />
    </button>
  );
}

// ─── Main Page ───

export default function CoachSettingsPage() {
  const {
    settings,
    teamMembers,
    invitations,
    loading,
    setOrgId,
    fetchSettings,
    updateSettings,
    updateIntegration,
    saveSettings,
    fetchTeam,
    inviteMember,
    removeMember,
    cancelInvitation,
  } = useCoachSettingsStore();

  const { language, setLanguage, theme, toggleTheme } = useAppStore();

  // Local profile state (not persisted in coach_settings, but in org/user profile)
  const [orgName, setOrgName] = useState('');
  const [coachName, setCoachName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [timezone, setTimezone] = useState('America/Mexico_City');

  // Team invite form
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('member');
  const [inviting, setInviting] = useState(false);

  // Additional emails
  const [newEmail, setNewEmail] = useState('');

  // Save status
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');

  // Confirm dialog for member removal
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  // Integration test states
  const [testingIntegration, setTestingIntegration] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ type: string; success: boolean; message: string } | null>(null);

  useEffect(() => {
    // Get orgId from cookie or localStorage
    const orgId = document.cookie
      .split('; ')
      .find((row) => row.startsWith('reclutify_active_org_id='))
      ?.split('=')[1];

    if (orgId) {
      setOrgId(orgId);
      fetchSettings();
      fetchTeam();
    }
  }, [setOrgId, fetchSettings, fetchTeam]);

  const handleSave = async () => {
    setSaveStatus('saving');
    const success = await saveSettings();
    setSaveStatus(success ? 'success' : 'error');
    setTimeout(() => setSaveStatus('idle'), 2500);
  };

  const handleAddEmail = () => {
    const trimmed = newEmail.trim().toLowerCase();
    if (trimmed && !settings.additionalEmails.includes(trimmed)) {
      updateSettings({ additionalEmails: [...settings.additionalEmails, trimmed] });
      setNewEmail('');
    }
  };

  const handleRemoveEmail = (email: string) => {
    updateSettings({
      additionalEmails: settings.additionalEmails.filter((e) => e !== email),
    });
  };

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;
    setInviting(true);
    await inviteMember(inviteEmail.trim(), inviteRole);
    setInviteEmail('');
    setInviting(false);
  };

  const handleRemoveMember = async (userId: string) => {
    await removeMember(userId);
    setConfirmRemove(null);
  };

  const handleTestIntegration = async (type: keyof Integrations) => {
    setTestingIntegration(type);
    setTestResult(null);

    try {
      const config = settings.integrations[type];
      const res = await fetch('/api/test-integration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, config }),
      });
      const data = await res.json();
      setTestResult({ type, success: data.success, message: data.message });
    } catch {
      setTestResult({ type, success: false, message: 'Error de red al probar la integración.' });
    } finally {
      setTestingIntegration(null);
    }
  };

  const handleWebhookEventsChange = (event: string, checked: boolean) => {
    const currentEvents = settings.integrations.webhook.events;
    const newEvents = checked
      ? [...currentEvents, event]
      : currentEvents.filter((e) => e !== event);
    updateIntegration('webhook', { events: newEvents });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto pb-24">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-foreground mb-1">Configuración</h1>
        <p className="text-sm text-muted">
          Administra las preferencias de tu organización, IA y equipo.
        </p>
      </div>

      <div className="space-y-6">
        {/* ─── Section 1: Perfil y Organización ─── */}
        <div className="bg-card rounded-2xl shadow-sm border border-border/50 overflow-hidden">
          <div className="p-5 border-b border-border/50 flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <User className="h-5 w-5" />
            </div>
            <h2 className="text-base font-medium text-foreground">Perfil y Organización</h2>
          </div>
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-muted mb-1.5">
                  Nombre de la organización
                </label>
                <input
                  type="text"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  placeholder="Mi Empresa"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted mb-1.5">
                  Nombre del coach
                </label>
                <input
                  type="text"
                  value={coachName}
                  onChange={(e) => setCoachName(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  placeholder="Tu nombre completo"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted mb-1.5">
                  Email de contacto
                </label>
                <input
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  placeholder="coach@ejemplo.com"
                />
              </div>
            </div>
          </div>
        </div>

        {/* ─── Section 2: Preferencias ─── */}
        <div className="bg-card rounded-2xl shadow-sm border border-border/50 overflow-hidden">
          <div className="p-5 border-b border-border/50 flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <Globe className="h-5 w-5" />
            </div>
            <h2 className="text-base font-medium text-foreground">Preferencias</h2>
          </div>
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-muted mb-1.5">
                  Idioma dashboard
                </label>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value as 'es' | 'en')}
                  className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <option value="es">Español</option>
                  <option value="en">English</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-muted mb-1.5">Tema</label>
                <button
                  type="button"
                  onClick={toggleTheme}
                  className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 text-left"
                >
                  {theme === 'light' ? '☀️ Claro' : '🌙 Oscuro'}
                </button>
              </div>
              <div>
                <label className="block text-sm font-medium text-muted mb-1.5">
                  Zona horaria
                </label>
                <select
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <option value="America/Mexico_City">Ciudad de México (GMT-6)</option>
                  <option value="America/Bogota">Bogotá (GMT-5)</option>
                  <option value="America/Lima">Lima (GMT-5)</option>
                  <option value="America/Santiago">Santiago (GMT-4)</option>
                  <option value="America/Buenos_Aires">Buenos Aires (GMT-3)</option>
                  <option value="America/New_York">New York (GMT-5)</option>
                  <option value="America/Los_Angeles">Los Angeles (GMT-8)</option>
                  <option value="Europe/Madrid">Madrid (GMT+1)</option>
                  <option value="Europe/London">Londres (GMT+0)</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* ─── Section 3: IA Coach Virtual ─── */}
        <div className="bg-card rounded-2xl shadow-sm border border-border/50 overflow-hidden">
          <div className="p-5 border-b border-border/50 flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <Bot className="h-5 w-5" />
            </div>
            <h2 className="text-base font-medium text-foreground">
              IA Coach Virtual (Global Defaults)
            </h2>
          </div>
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-muted mb-1.5">
                  Nombre del asistente
                </label>
                <input
                  type="text"
                  value={settings.assistantName}
                  onChange={(e) => updateSettings({ assistantName: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  placeholder="Asistente Virtual"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted mb-1.5">
                  Tono de conversación
                </label>
                <select
                  value={settings.conversationTone}
                  onChange={(e) =>
                    updateSettings({
                      conversationTone: e.target.value as 'formal' | 'amigable' | 'entusiasta',
                    })
                  }
                  className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <option value="formal">Formal</option>
                  <option value="amigable">Amigable</option>
                  <option value="entusiasta">Entusiasta</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-muted mb-1.5">
                  Idioma de las sesiones
                </label>
                <select
                  value={settings.sessionLanguage}
                  onChange={(e) =>
                    updateSettings({ sessionLanguage: e.target.value as 'es' | 'en' })
                  }
                  className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <option value="es">Español</option>
                  <option value="en">English</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-muted mb-1.5">
                Mensaje de bienvenida
              </label>
              <textarea
                value={settings.welcomeMessage}
                onChange={(e) => updateSettings({ welcomeMessage: e.target.value })}
                rows={3}
                className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                placeholder="Hola, soy tu asistente virtual. ¿En qué puedo ayudarte hoy?"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-muted mb-1.5">
                Nivel de persistencia en ventas
              </label>
              <div className="flex gap-2">
                {([1, 2, 3] as const).map((level) => {
                  const labels = { 1: 'Suave', 2: 'Moderado', 3: 'Agresivo' };
                  return (
                    <button
                      key={level}
                      type="button"
                      onClick={() => updateSettings({ salesPersistence: level })}
                      className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-medium transition-all border ${
                        settings.salesPersistence === level
                          ? 'bg-primary text-black border-primary'
                          : 'bg-background text-foreground border-border hover:border-primary/50'
                      }`}
                    >
                      {labels[level]}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-muted mb-1.5">
                Instrucciones adicionales para la IA
              </label>
              <textarea
                value={settings.customInstructions}
                onChange={(e) => updateSettings({ customInstructions: e.target.value })}
                rows={3}
                className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                placeholder="ej. Nunca menciones a la competencia..."
              />
            </div>

            <div className="flex items-start gap-2 p-3 rounded-xl bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800/30">
              <Info className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
              <p className="text-xs text-blue-700 dark:text-blue-300">
                Cada curso puede tener su propia configuración de IA que sobreescriba estos valores
                globales.
              </p>
            </div>
          </div>
        </div>

        {/* ─── Section 4: Configuración de Sesiones ─── */}
        <div className="bg-card rounded-2xl shadow-sm border border-border/50 overflow-hidden">
          <div className="p-5 border-b border-border/50 flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <Clock className="h-5 w-5" />
            </div>
            <h2 className="text-base font-medium text-foreground">Configuración de Sesiones</h2>
          </div>
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-muted mb-1.5">
                  Duración predeterminada (min)
                </label>
                <input
                  type="number"
                  min={5}
                  max={120}
                  value={settings.defaultSessionDuration}
                  onChange={(e) =>
                    updateSettings({
                      defaultSessionDuration: Math.max(5, Math.min(120, Number(e.target.value))),
                    })
                  }
                  className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted mb-1.5">
                  Modo de cierre predeterminado
                </label>
                <select
                  value={settings.defaultClosingMode}
                  onChange={(e) =>
                    updateSettings({
                      defaultClosingMode: e.target.value as 'presential' | 'remote' | 'both',
                    })
                  }
                  className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <option value="presential">Presencial</option>
                  <option value="remote">Remoto</option>
                  <option value="both">Ambos</option>
                </select>
              </div>
            </div>

            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between py-2 border-b border-border/30">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    Auto-notificar al llegar a inversión
                  </p>
                  <p className="text-xs text-muted">
                    Envía una alerta cuando el lead está listo para invertir
                  </p>
                </div>
                <Toggle
                  active={settings.autoNotifyOnInvestment}
                  onChange={() =>
                    updateSettings({ autoNotifyOnInvestment: !settings.autoNotifyOnInvestment })
                  }
                />
              </div>
              <div className="flex items-center justify-between py-2">
                <div>
                  <p className="text-sm font-medium text-foreground">Sonido de notificación</p>
                  <p className="text-xs text-muted">Reproduce un sonido al recibir alertas</p>
                </div>
                <Toggle
                  active={settings.notificationSound}
                  onChange={() =>
                    updateSettings({ notificationSound: !settings.notificationSound })
                  }
                />
              </div>
            </div>
          </div>
        </div>

        {/* ─── Section 5: Notificaciones por Email ─── */}
        <div className="bg-card rounded-2xl shadow-sm border border-border/50 overflow-hidden">
          <div className="p-5 border-b border-border/50 flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <Bell className="h-5 w-5" />
            </div>
            <h2 className="text-base font-medium text-foreground">Notificaciones por Email</h2>
          </div>
          <div className="p-5 space-y-3">
            <div className="flex items-center justify-between py-2 border-b border-border/30">
              <div>
                <p className="text-sm font-medium text-foreground">
                  Email al detectar cierre presencial
                </p>
                <p className="text-xs text-muted">Notifica cuando un lead está listo para cierre en persona</p>
              </div>
              <Toggle
                active={settings.emailOnClosing}
                onChange={() => updateSettings({ emailOnClosing: !settings.emailOnClosing })}
              />
            </div>
            <div className="flex items-center justify-between py-2 border-b border-border/30">
              <div>
                <p className="text-sm font-medium text-foreground">Email al capturar nuevo lead</p>
                <p className="text-xs text-muted">Recibe notificación al registrarse un nuevo prospecto</p>
              </div>
              <Toggle
                active={settings.emailOnNewLead}
                onChange={() => updateSettings({ emailOnNewLead: !settings.emailOnNewLead })}
              />
            </div>
            <div className="flex items-center justify-between py-2 border-b border-border/30">
              <div>
                <p className="text-sm font-medium text-foreground">
                  Email al detectar objeción no resuelta
                </p>
                <p className="text-xs text-muted">Alerta cuando la IA no pudo resolver una objeción</p>
              </div>
              <Toggle
                active={settings.emailOnObjection}
                onChange={() => updateSettings({ emailOnObjection: !settings.emailOnObjection })}
              />
            </div>
            <div className="flex items-center justify-between py-2 border-b border-border/30">
              <div>
                <p className="text-sm font-medium text-foreground">Resumen diario de sesiones</p>
                <p className="text-xs text-muted">Recibe un resumen diario de toda la actividad</p>
              </div>
              <Toggle
                active={settings.emailDailySummary}
                onChange={() =>
                  updateSettings({ emailDailySummary: !settings.emailDailySummary })
                }
              />
            </div>

            {/* Additional Emails */}
            <div className="pt-4">
              <label className="block text-sm font-medium text-muted mb-2">
                Emails adicionales
              </label>
              <div className="flex gap-2 mb-3">
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddEmail();
                    }
                  }}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  placeholder="otro@email.com"
                />
                <button
                  type="button"
                  onClick={handleAddEmail}
                  className="px-4 py-2.5 rounded-xl bg-primary text-black text-sm font-medium hover:bg-primary/90 transition-colors"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              {settings.additionalEmails.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {settings.additionalEmails.map((email) => (
                    <span
                      key={email}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted/10 border border-border/50 text-xs text-foreground"
                    >
                      {email}
                      <button
                        type="button"
                        onClick={() => handleRemoveEmail(email)}
                        className="text-muted hover:text-danger transition-colors"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ─── Section 6: Página Pública ─── */}
        <div className="bg-card rounded-2xl shadow-sm border border-border/50 overflow-hidden">
          <div className="p-5 border-b border-border/50 flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <FileText className="h-5 w-5" />
            </div>
            <h2 className="text-base font-medium text-foreground">Página Pública</h2>
          </div>
          <div className="p-5 space-y-4">
            <div>
              <label className="block text-sm font-medium text-muted mb-1.5">
                Mensaje de bienvenida
              </label>
              <textarea
                value={settings.publicWelcomeMessage}
                onChange={(e) => updateSettings({ publicWelcomeMessage: e.target.value })}
                rows={3}
                className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                placeholder="Bienvenido a nuestra plataforma de cursos..."
              />
            </div>
            <div className="flex items-center justify-between py-2 border-b border-border/30">
              <div>
                <p className="text-sm font-medium text-foreground">
                  Mostrar nombre de la organización
                </p>
                <p className="text-xs text-muted">Visible en la página pública de tus cursos</p>
              </div>
              <Toggle
                active={settings.showOrgName}
                onChange={() => updateSettings({ showOrgName: !settings.showOrgName })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-muted mb-1.5">
                Color de acento
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={settings.accentColor}
                  onChange={(e) => updateSettings({ accentColor: e.target.value })}
                  className="h-10 w-14 rounded-lg border border-border cursor-pointer"
                />
                <input
                  type="text"
                  value={settings.accentColor}
                  onChange={(e) => updateSettings({ accentColor: e.target.value })}
                  className="w-32 px-4 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 font-mono"
                  placeholder="#D3FB52"
                />
              </div>
            </div>
          </div>
        </div>

        {/* ─── Section 7: Integraciones ─── */}
        <div className="bg-card rounded-2xl shadow-sm border border-border/50 overflow-hidden">
          <div className="p-5 border-b border-border/50 flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <Link2 className="h-5 w-5" />
            </div>
            <h2 className="text-base font-medium text-foreground">Integraciones</h2>
          </div>
          <div className="p-5 space-y-6">
            {/* 7a. Webhook Genérico */}
            <div className="space-y-3 pb-6 border-b border-border/30">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">Webhook Genérico</h3>
                <Toggle
                  active={settings.integrations.webhook.enabled}
                  onChange={() =>
                    updateIntegration('webhook', {
                      enabled: !settings.integrations.webhook.enabled,
                    })
                  }
                />
              </div>
              {settings.integrations.webhook.enabled && (
                <div className="space-y-3 pl-0 mt-3">
                  <div>
                    <label className="block text-xs font-medium text-muted mb-1">URL</label>
                    <input
                      type="text"
                      value={settings.integrations.webhook.url}
                      onChange={(e) => updateIntegration('webhook', { url: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                      placeholder="https://tu-servidor.com/webhook"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted mb-1">
                      Secret HMAC
                    </label>
                    <input
                      type="password"
                      value={settings.integrations.webhook.secret}
                      onChange={(e) => updateIntegration('webhook', { secret: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                      placeholder="Tu secret para firmar payloads"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted mb-1.5">Eventos</label>
                    <div className="flex flex-wrap gap-3">
                      {['new_lead', 'closing_ready', 'session_completed'].map((event) => (
                        <label key={event} className="flex items-center gap-2 text-sm text-foreground">
                          <input
                            type="checkbox"
                            checked={settings.integrations.webhook.events.includes(event)}
                            onChange={(e) => handleWebhookEventsChange(event, e.target.checked)}
                            className="rounded border-border text-primary focus:ring-primary"
                          />
                          {event.replace(/_/g, ' ')}
                        </label>
                      ))}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleTestIntegration('webhook')}
                    disabled={testingIntegration === 'webhook' || !settings.integrations.webhook.url}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {testingIntegration === 'webhook' ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                    Probar Webhook
                  </button>
                  {testResult?.type === 'webhook' && (
                    <p className={`text-xs ${testResult.success ? 'text-green-600' : 'text-red-500'}`}>
                      {testResult.message}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* 7b. Google Sheets */}
            <div className="space-y-3 pb-6 border-b border-border/30">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">Google Sheets</h3>
                <Toggle
                  active={settings.integrations.google_sheets.enabled}
                  onChange={() =>
                    updateIntegration('google_sheets', {
                      enabled: !settings.integrations.google_sheets.enabled,
                    })
                  }
                />
              </div>
              {settings.integrations.google_sheets.enabled && (
                <div className="space-y-3 mt-3">
                  <div>
                    <label className="block text-xs font-medium text-muted mb-1">
                      Spreadsheet ID
                    </label>
                    <input
                      type="text"
                      value={settings.integrations.google_sheets.spreadsheet_id}
                      onChange={(e) =>
                        updateIntegration('google_sheets', { spreadsheet_id: e.target.value })
                      }
                      className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                      placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted mb-1">
                      Service Account JSON
                    </label>
                    <textarea
                      value={settings.integrations.google_sheets.credentials}
                      onChange={(e) =>
                        updateIntegration('google_sheets', { credentials: e.target.value })
                      }
                      rows={4}
                      className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                      placeholder='{"type": "service_account", ...}'
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted mb-1">
                      Sheet Name
                    </label>
                    <input
                      type="text"
                      value={settings.integrations.google_sheets.sheet_name}
                      onChange={(e) =>
                        updateIntegration('google_sheets', { sheet_name: e.target.value })
                      }
                      className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                      placeholder="Leads"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => handleTestIntegration('google_sheets')}
                    disabled={
                      testingIntegration === 'google_sheets' ||
                      !settings.integrations.google_sheets.spreadsheet_id
                    }
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {testingIntegration === 'google_sheets' ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                    Probar Google Sheets
                  </button>
                  {testResult?.type === 'google_sheets' && (
                    <p className={`text-xs ${testResult.success ? 'text-green-600' : 'text-red-500'}`}>
                      {testResult.message}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* 7c. HubSpot */}
            <div className="space-y-3 pb-6 border-b border-border/30">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">HubSpot</h3>
                <Toggle
                  active={settings.integrations.hubspot.enabled}
                  onChange={() =>
                    updateIntegration('hubspot', {
                      enabled: !settings.integrations.hubspot.enabled,
                    })
                  }
                />
              </div>
              {settings.integrations.hubspot.enabled && (
                <div className="space-y-3 mt-3">
                  <div>
                    <label className="block text-xs font-medium text-muted mb-1">
                      Private App Token
                    </label>
                    <input
                      type="password"
                      value={settings.integrations.hubspot.api_key}
                      onChange={(e) => updateIntegration('hubspot', { api_key: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                      placeholder="pat-na1-..."
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted mb-1">
                      Pipeline ID (opcional)
                    </label>
                    <input
                      type="text"
                      value={settings.integrations.hubspot.pipeline_id}
                      onChange={(e) =>
                        updateIntegration('hubspot', { pipeline_id: e.target.value })
                      }
                      className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                      placeholder="default"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => handleTestIntegration('hubspot')}
                    disabled={
                      testingIntegration === 'hubspot' || !settings.integrations.hubspot.api_key
                    }
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {testingIntegration === 'hubspot' ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                    Probar HubSpot
                  </button>
                  {testResult?.type === 'hubspot' && (
                    <p className={`text-xs ${testResult.success ? 'text-green-600' : 'text-red-500'}`}>
                      {testResult.message}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* 7d. Notion */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">Notion</h3>
                <Toggle
                  active={settings.integrations.notion.enabled}
                  onChange={() =>
                    updateIntegration('notion', {
                      enabled: !settings.integrations.notion.enabled,
                    })
                  }
                />
              </div>
              {settings.integrations.notion.enabled && (
                <div className="space-y-3 mt-3">
                  <div>
                    <label className="block text-xs font-medium text-muted mb-1">
                      Integration Token
                    </label>
                    <input
                      type="password"
                      value={settings.integrations.notion.token}
                      onChange={(e) => updateIntegration('notion', { token: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                      placeholder="secret_..."
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted mb-1">
                      Database ID
                    </label>
                    <input
                      type="text"
                      value={settings.integrations.notion.database_id}
                      onChange={(e) =>
                        updateIntegration('notion', { database_id: e.target.value })
                      }
                      className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                      placeholder="a1b2c3d4..."
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => handleTestIntegration('notion')}
                    disabled={
                      testingIntegration === 'notion' || !settings.integrations.notion.token
                    }
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {testingIntegration === 'notion' ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                    Probar Notion
                  </button>
                  {testResult?.type === 'notion' && (
                    <p className={`text-xs ${testResult.success ? 'text-green-600' : 'text-red-500'}`}>
                      {testResult.message}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ─── Section 8: Gestión de Equipo ─── */}
        <div className="bg-card rounded-2xl shadow-sm border border-border/50 overflow-hidden">
          <div className="p-5 border-b border-border/50 flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <Users className="h-5 w-5" />
            </div>
            <h2 className="text-base font-medium text-foreground">Gestión de Equipo</h2>
          </div>
          <div className="p-5 space-y-5">
            {/* Current Members Table */}
            {teamMembers.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="text-left py-2 px-3 font-medium text-muted">Nombre</th>
                      <th className="text-left py-2 px-3 font-medium text-muted">Rol</th>
                      <th className="text-left py-2 px-3 font-medium text-muted">Desde</th>
                      <th className="text-right py-2 px-3 font-medium text-muted">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {teamMembers.map((member) => (
                      <tr key={member.userId} className="border-b border-border/20">
                        <td className="py-2.5 px-3 text-foreground">{member.fullName}</td>
                        <td className="py-2.5 px-3">
                          <span className="inline-flex px-2 py-0.5 rounded-md bg-muted/10 text-xs font-medium text-muted capitalize">
                            {member.role}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-muted">
                          {new Date(member.joinedAt).toLocaleDateString('es-MX')}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          {confirmRemove === member.userId ? (
                            <div className="flex items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => handleRemoveMember(member.userId)}
                                className="px-2 py-1 rounded-md text-xs font-medium bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400 transition-colors"
                              >
                                Confirmar
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmRemove(null)}
                                className="px-2 py-1 rounded-md text-xs font-medium text-muted hover:text-foreground transition-colors"
                              >
                                Cancelar
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmRemove(member.userId)}
                              className="p-1.5 rounded-lg text-muted hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                              title="Eliminar miembro"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {teamMembers.length === 0 && (
              <p className="text-sm text-muted text-center py-4">
                No hay miembros en el equipo aún.
              </p>
            )}

            {/* Invite Form */}
            <div className="pt-4 border-t border-border/30">
              <h4 className="text-sm font-medium text-foreground mb-3">Invitar nuevo miembro</h4>
              <div className="flex gap-2">
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  placeholder="email@ejemplo.com"
                />
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  className="px-3 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <option value="member">Miembro</option>
                  <option value="admin">Admin</option>
                </select>
                <button
                  type="button"
                  onClick={handleInvite}
                  disabled={inviting || !inviteEmail.trim()}
                  className="px-4 py-2.5 rounded-xl bg-primary text-black text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {inviting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    'Invitar'
                  )}
                </button>
              </div>
            </div>

            {/* Pending Invitations */}
            {invitations.length > 0 && (
              <div className="pt-4 border-t border-border/30">
                <h4 className="text-sm font-medium text-foreground mb-3">
                  Invitaciones pendientes
                </h4>
                <div className="space-y-2">
                  {invitations.map((inv) => (
                    <div
                      key={inv.id}
                      className="flex items-center justify-between p-3 rounded-xl bg-background border border-border/30"
                    >
                      <div>
                        <p className="text-sm text-foreground">{inv.email}</p>
                        <p className="text-xs text-muted capitalize">
                          {inv.role} &middot; Enviada{' '}
                          {new Date(inv.createdAt).toLocaleDateString('es-MX')}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => cancelInvitation(inv.id)}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 border border-red-200 dark:border-red-800/30 transition-colors"
                      >
                        Cancelar
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ─── Sticky Save Bar ─── */}
      <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-border/50 bg-card/95 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-end">
          <button
            type="button"
            onClick={handleSave}
            disabled={saveStatus === 'saving'}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-medium transition-all ${
              saveStatus === 'success'
                ? 'bg-green-500 text-white hover:bg-green-600'
                : saveStatus === 'error'
                  ? 'bg-red-500 text-white'
                  : 'bg-primary text-black hover:bg-primary/90'
            }`}
          >
            {saveStatus === 'saving' ? (
              <span className="h-4 w-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
            ) : saveStatus === 'success' ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {saveStatus === 'saving'
              ? 'Guardando...'
              : saveStatus === 'success'
                ? 'Guardado'
                : saveStatus === 'error'
                  ? 'Error al guardar'
                  : 'Guardar Cambios'}
          </button>
        </div>
      </div>
    </div>
  );
}
