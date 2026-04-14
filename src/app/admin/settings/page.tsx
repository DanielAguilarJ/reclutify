'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { User, Bell, Globe, Save, CheckCircle2, CreditCard, Key, Link2, Send, Loader2, Trash2, ExternalLink } from 'lucide-react';
import { useAppStore, PlanTier } from '@/store/appStore';
import { useWebhookStore } from '@/store/webhookStore';
import { dictionaries } from '@/lib/i18n';

export default function SettingsPage() {
  const { language, setLanguage, planTier, setPlanTier } = useAppStore();
  const { webhookUrl, webhookSecret, webhookLogs, setWebhookUrl, setWebhookSecret, addLog, clearLogs } = useWebhookStore();
  const t = dictionaries[language];

  // Local state for mock settings
  const [profile, setProfile] = useState({ name: 'Admin RH', email: 'admin@worldbrain.com', company: 'WorldBrain Mexico' });
  const [timezone, setTimezone] = useState('America/Mexico_City');
  const [notifications, setNotifications] = useState({ newCandidate: true, interviewCompleted: true });
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success'>('idle');
  const [testingWebhook, setTestingWebhook] = useState(false);

  const handleSave = () => {
    setSaveStatus('saving');
    // Simulate an API call
    setTimeout(() => {
      setSaveStatus('success');
      setTimeout(() => setSaveStatus('idle'), 2000);
    }, 800);
  };

  const handleTestWebhook = async () => {
    if (!webhookUrl) return;
    setTestingWebhook(true);

    const testPayload = {
      webhookUrl,
      webhookSecret,
      candidateId: 'test-candidate-001',
      roleId: 'test-role-001',
      candidateName: 'Test Candidate',
      overallScore: 82,
      recommendation: 'Strong Hire',
      topicScores: { 'Technical Skills': 9, 'Communication': 8, 'Problem Solving': 7 },
      completedAt: new Date().toISOString(),
      isTest: true,
    };

    try {
      const response = await fetch('/api/webhooks/candidate-completed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testPayload),
      });

      const data = await response.json();

      addLog({
        id: `log-${Date.now()}`,
        timestamp: Date.now(),
        status: data.success ? 'success' : 'error',
        responseCode: data.statusCode || 0,
        payload: 'Test webhook payload',
      });
    } catch (err) {
      addLog({
        id: `log-${Date.now()}`,
        timestamp: Date.now(),
        status: 'error',
        responseCode: 0,
        payload: 'Test webhook failed to send',
      });
    } finally {
      setTestingWebhook(false);
    }
  };

  const hasChanges = true; // For demonstration, assume changes are possible

  // Simple toggle component
  const Toggle = ({ active, onChange }: { active: boolean; onChange: () => void }) => (
    <button
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

  return (
    <div className="max-w-4xl mx-auto pb-12">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-foreground mb-1">
          {language === 'es' ? 'Configuración' : 'Settings'}
        </h1>
        <p className="text-sm text-muted">
          {language === 'es' ? 'Administra las preferencias y detalles de tu cuenta.' : 'Manage your account details and preferences.'}
        </p>
      </div>

      <div className="space-y-6">
        {/* Profile Settings */}
        <div className="bg-card rounded-2xl shadow-sm border border-border/50 overflow-hidden">
          <div className="p-5 border-b border-border/50 flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <User className="h-5 w-5" />
            </div>
            <h2 className="text-base font-medium text-foreground">
              {language === 'es' ? 'Perfil' : 'Profile'}
            </h2>
          </div>
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-muted mb-1.5">{language === 'es' ? 'Nombre de la Empresa' : 'Company Name'}</label>
                <input
                  type="text"
                  value={profile.company}
                  onChange={(e) => setProfile({ ...profile, company: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  placeholder="e.g. Acme Corp"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted mb-1.5">{language === 'es' ? 'Nombre Completo' : 'Full Name'}</label>
                <input
                  type="text"
                  value={profile.name}
                  onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted mb-1.5">{language === 'es' ? 'Correo Electrónico' : 'Email Address'}</label>
                <input
                  type="email"
                  value={profile.email}
                  onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Preferences */}
        <div className="bg-card rounded-2xl shadow-sm border border-border/50 overflow-hidden">
          <div className="p-5 border-b border-border/50 flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <Globe className="h-5 w-5" />
            </div>
            <h2 className="text-base font-medium text-foreground">
              {language === 'es' ? 'Preferencias' : 'Preferences'}
            </h2>
          </div>
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-muted mb-1.5">{language === 'es' ? 'Idioma del Dashboard' : 'Dashboard Language'}</label>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value as 'en' | 'es')}
                  className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <option value="es">🇲🇽 Español</option>
                  <option value="en">🇺🇸 English</option>
                </select>
                <p className="mt-1.5 text-xs text-muted/80">
                  {language === 'es' ? 'Cambia el idioma de la interfaz.' : 'Change the interface language.'}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-muted mb-1.5">{language === 'es' ? 'Zona Horaria' : 'Timezone'}</label>
                <select
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <option value="America/Mexico_City">Mexico City (GMT-6)</option>
                  <option value="America/New_York">New York (EST/EDT)</option>
                  <option value="Europe/London">London (GMT/BST)</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Subscription & Billing */}
        <div className="bg-card rounded-2xl shadow-sm border border-border/50 overflow-hidden">
          <div className="p-5 border-b border-border/50 flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <CreditCard className="h-5 w-5" />
            </div>
            <h2 className="text-base font-medium text-foreground">
              {language === 'es' ? 'Suscripción y Facturación' : 'Subscription & Billing'}
            </h2>
          </div>
          <div className="p-5 space-y-6">
            <div>
              <label className="block text-sm font-medium text-muted mb-1.5">{language === 'es' ? 'Plan Activo (Suscripción Simulada)' : 'Active Plan (Simulated Subscription)'}</label>
              <select
                value={planTier}
                onChange={(e) => setPlanTier(e.target.value as PlanTier)}
                className="w-full md:w-1/2 px-4 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="starter">Starter ($29/mo) - 3 Roles Max</option>
                <option value="pro">Pro ($79/mo) - Priority Support, Transcripts</option>
                <option value="enterprise">Enterprise ($199/mo) - White Label, API</option>
              </select>
              <p className="mt-1.5 text-xs text-muted/80">
                {language === 'es' 
                  ? 'Cambia tu plan aquí para ver cómo se habilitan o bloquean las diferentes funciones en la plataforma.' 
                  : 'Change your plan here to see how different features are enabled or locked across the platform.'}
              </p>
            </div>

            {/* API Access (Enterprise Only) */}
            <div className="pt-4 border-t border-border/30">
              <div className="flex items-center gap-2 mb-3">
                <Key className="h-4 w-4 text-muted" />
                <h3 className="text-sm font-medium text-foreground">API Access</h3>
              </div>
              {planTier === 'enterprise' ? (
                <div className="bg-background rounded-xl border border-border/50 p-4">
                  <p className="text-xs text-muted mb-2">WorldBrain API Key (Secret)</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 bg-muted/20 px-3 py-2 rounded-lg text-xs font-mono text-foreground break-all">
                      wb_live_sk_7f8a9...[REDACTED]...2c4b
                    </code>
                    <button className="px-3 py-2 bg-primary/10 hover:bg-primary/20 text-primary rounded-lg text-xs font-medium transition-colors">
                      {language === 'es' ? 'Copiar' : 'Copy'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="bg-muted/10 rounded-xl border border-border/50 p-6 text-center">
                  <Key className="h-6 w-6 text-muted/50 mx-auto mb-2" />
                  <p className="text-sm font-medium text-muted">API Access is locked</p>
                  <p className="text-xs text-muted/80 mt-1">Upgrade to Enterprise to generate API keys.</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Module 4: Webhook Integrations */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card rounded-2xl shadow-sm border border-border/50 overflow-hidden"
        >
          <div className="p-5 border-b border-border/50 flex items-center gap-3">
            <div className="p-2 rounded-xl bg-cyan-40/10 text-cyan-40">
              <Link2 className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-medium text-foreground">
                {language === 'es' ? 'Integraciones (Webhooks)' : 'Integrations (Webhooks)'}
              </h2>
              <p className="text-xs text-muted">
                {language === 'es' 
                  ? 'Conecta Reclutify con tu ATS (Greenhouse, Lever, Ashby, etc.)' 
                  : 'Connect Reclutify to your ATS (Greenhouse, Lever, Ashby, etc.)'}
              </p>
            </div>
          </div>
          <div className="p-5 space-y-5">
            {/* Webhook URL */}
            <div>
              <label className="block text-sm font-medium text-muted mb-1.5">
                {language === 'es' ? 'URL del Webhook' : 'Webhook URL'}
              </label>
              <input
                type="url"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="https://yourcompany.greenhouse.io/webhooks/reclutify"
                className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted/50"
              />
              <p className="mt-1.5 text-xs text-muted/80">
                {language === 'es' 
                  ? 'Se enviará un POST con los resultados de la entrevista a esta URL cuando se complete una evaluación.' 
                  : 'A POST with interview results will be sent to this URL when an evaluation is completed.'}
              </p>
            </div>

            {/* Secret Token */}
            <div>
              <label className="block text-sm font-medium text-muted mb-1.5">
                {language === 'es' ? 'Token Secreto (HMAC-SHA256)' : 'Secret Token (HMAC-SHA256)'}
              </label>
              <input
                type="password"
                value={webhookSecret}
                onChange={(e) => setWebhookSecret(e.target.value)}
                placeholder={language === 'es' ? 'Tu token secreto para verificación...' : 'Your secret token for verification...'}
                className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted/50"
              />
              <p className="mt-1.5 text-xs text-muted/80">
                {language === 'es' 
                  ? 'Opcional. Se usará para firmar el payload con HMAC-SHA256 en el header X-Signature-256.' 
                  : 'Optional. Used to sign the payload with HMAC-SHA256 in the X-Signature-256 header.'}
              </p>
            </div>

            {/* Test Webhook Button */}
            <div className="flex items-center gap-3">
              <button
                onClick={handleTestWebhook}
                disabled={!webhookUrl || testingWebhook}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-cyan-40/10 text-cyan-40 hover:bg-cyan-40/20 border border-cyan-40/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {testingWebhook ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                {language === 'es' ? 'Probar Webhook' : 'Test Webhook'}
              </button>
              {!webhookUrl && (
                <span className="text-xs text-muted">
                  {language === 'es' ? 'Ingresa una URL primero' : 'Enter a URL first'}
                </span>
              )}
            </div>

            {/* Webhook Logs */}
            {webhookLogs.length > 0 && (
              <div className="pt-4 border-t border-border/30">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium text-foreground">
                    {language === 'es' ? 'Historial de Webhooks' : 'Webhook History'}
                  </h3>
                  <button
                    onClick={clearLogs}
                    className="flex items-center gap-1 text-xs text-muted hover:text-danger transition-colors cursor-pointer"
                  >
                    <Trash2 className="h-3 w-3" />
                    {language === 'es' ? 'Limpiar' : 'Clear'}
                  </button>
                </div>
                <div className="space-y-2">
                  {webhookLogs.map((log) => (
                    <div
                      key={log.id}
                      className="flex items-center gap-3 p-3 rounded-xl bg-background border border-border/30"
                    >
                      <div className={`w-2 h-2 rounded-full shrink-0 ${
                        log.status === 'success' ? 'bg-success' : log.status === 'error' ? 'bg-danger' : 'bg-warning'
                      }`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground">{log.payload}</p>
                        <p className="text-[10px] text-muted">
                          {new Date(log.timestamp).toLocaleString(language === 'es' ? 'es-MX' : 'en-US')}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {log.responseCode !== null && log.responseCode > 0 && (
                          <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded-md ${
                            log.responseCode >= 200 && log.responseCode < 300
                              ? 'bg-success/10 text-success'
                              : 'bg-danger/10 text-danger'
                          }`}>
                            {log.responseCode}
                          </span>
                        )}
                        <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full ${
                          log.status === 'success' 
                            ? 'bg-success/10 text-success' 
                            : 'bg-danger/10 text-danger'
                        }`}>
                          {log.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </motion.div>

        {/* Notifications */}
        <div className="bg-card rounded-2xl shadow-sm border border-border/50 overflow-hidden">
          <div className="p-5 border-b border-border/50 flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <Bell className="h-5 w-5" />
            </div>
            <h2 className="text-base font-medium text-foreground">
              {language === 'es' ? 'Notificaciones' : 'Notifications'}
            </h2>
          </div>
          <div className="p-5 space-y-4">
            <div className="flex items-center justify-between py-2 border-b border-border/30 last:border-0">
              <div>
                <p className="text-sm font-medium text-foreground">{language === 'es' ? 'Nuevos Candidatos' : 'New Candidates'}</p>
                <p className="text-xs text-muted">{language === 'es' ? 'Recibir email cuando se postule' : 'Receive an email when someone applies'}</p>
              </div>
              <Toggle 
                active={notifications.newCandidate} 
                onChange={() => setNotifications(prev => ({ ...prev, newCandidate: !prev.newCandidate }))} 
              />
            </div>
            <div className="flex items-center justify-between py-2 border-b border-border/30 last:border-0">
              <div>
                <p className="text-sm font-medium text-foreground">{language === 'es' ? 'Entrevistas Completadas' : 'Completed Interviews'}</p>
                <p className="text-xs text-muted">{language === 'es' ? 'Alerta al finalizar con éxito' : 'Alert when an interview finishes'}</p>
              </div>
              <Toggle 
                active={notifications.interviewCompleted} 
                onChange={() => setNotifications(prev => ({ ...prev, interviewCompleted: !prev.interviewCompleted }))} 
              />
            </div>
          </div>
        </div>
      </div>

      {/* Action Bar */}
      <div className="mt-8 flex justify-end">
        <button
          onClick={handleSave}
          disabled={saveStatus === 'saving'}
          className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-medium text-white transition-all ${
            saveStatus === 'success' 
              ? 'bg-success hover:bg-success/90' 
              : 'bg-primary hover:bg-primary-hover'
          }`}
        >
          {saveStatus === 'saving' ? (
            <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : saveStatus === 'success' ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          {saveStatus === 'saving' 
            ? (language === 'es' ? 'Guardando...' : 'Saving...')
            : saveStatus === 'success'
              ? (language === 'es' ? 'Guardado' : 'Saved')
              : (language === 'es' ? 'Guardar Cambios' : 'Save Changes')}
        </button>
      </div>
    </div>
  );
}
