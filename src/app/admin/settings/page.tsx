'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { User, Bell, Globe, Save, CheckCircle2, CreditCard, Key, Link2, Send, Loader2, Trash2, ExternalLink, Crown, Zap, Building2, ArrowUpRight } from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { useWebhookStore } from '@/store/webhookStore';
import { dictionaries } from '@/lib/i18n';
import { createClient } from '@/utils/supabase/client';
import type { PlanTier } from '@/lib/stripe';

// ─── Subscription card ────────────────────────────────────────────────────────
interface OrgSubscription {
  plan_tier: PlanTier;
  subscription_status: string;
  subscription_period_end: string | null;
  billing_interval: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
}

const PLAN_META: Record<PlanTier, { label: string; price: number; color: string; Icon: React.ElementType }> = {
  starter:    { label: 'Starter',    price: 87,  color: '#D3FB52', Icon: Zap },
  pro:        { label: 'Pro',        price: 237,  color: '#00D3D8', Icon: Crown },
  enterprise: { label: 'Enterprise', price: 597, color: '#b56afa', Icon: Building2 },
};

function BillingCard({ language }: { language: string }) {
  const [sub, setSub]                 = useState<OrgSubscription | null>(null);
  const [loading, setLoading]         = useState(true);
  const [portalLoading, setPortal]    = useState(false);
  const [checkoutTier, setCheckout]   = useState<string | null>(null);
  const es = language === 'es';

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      const { data: profile } = await supabase
        .from('user_profiles')
        .select('org_id')
        .eq('user_id', user.id)
        .single();
      if (!profile?.org_id) { setLoading(false); return; }

      const { data: org } = await supabase
        .from('organizations')
        .select('plan_tier, subscription_status, subscription_period_end, billing_interval, stripe_customer_id, stripe_subscription_id')
        .eq('id', profile.org_id)
        .single();

      if (org) setSub(org as OrgSubscription);
      setLoading(false);
    }
    load();
  }, []);

  async function openPortal() {
    setPortal(true);
    try {
      const res  = await fetch('/api/stripe/portal', { method: 'POST' });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } finally {
      setPortal(false);
    }
  }

  async function upgrade(tier: string) {
    setCheckout(tier);
    try {
      const res  = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier, interval: 'monthly' }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } finally {
      setCheckout(null);
    }
  }

  if (loading) {
    return (
      <div className="p-5 flex items-center justify-center text-muted text-sm gap-2">
        <Loader2 className="w-4 h-4 animate-spin" /> {es ? 'Cargando...' : 'Loading...'}
      </div>
    );
  }

  const currentTier = (sub?.plan_tier ?? 'starter') as PlanTier;
  const meta        = PLAN_META[currentTier];
  const Icon        = meta.Icon;
  const isActive    = !sub?.subscription_status || ['active','trialing'].includes(sub.subscription_status);
  const periodEnd   = sub?.subscription_period_end
    ? new Date(sub.subscription_period_end).toLocaleDateString(es ? 'es-MX' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : null;

  return (
    <div className="p-5 space-y-5">
      {/* Current plan badge */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${meta.color}20` }}>
            <Icon className="w-5 h-5" style={{ color: meta.color }} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-base font-semibold text-foreground">{meta.label}</span>
              <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                isActive ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'
              }`}>
                {isActive ? (es ? 'Activo' : 'Active') : sub?.subscription_status}
              </span>
            </div>
            <p className="text-sm text-muted">
              ${meta.price}/mo
              {sub?.billing_interval === 'yearly' && (
                <span className="ml-2 text-xs text-success">
                  {es ? '(facturado anual — 20% off)' : '(billed yearly — 20% off)'}
                </span>
              )}
            </p>
            {periodEnd && (
              <p className="text-xs text-muted/70 mt-0.5">
                {es ? `Próximo ciclo: ${periodEnd}` : `Next billing: ${periodEnd}`}
              </p>
            )}
          </div>
        </div>

        {sub?.stripe_customer_id && (
          <button
            onClick={openPortal}
            disabled={portalLoading}
            className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-surface hover:bg-surface-hover border border-border transition-colors disabled:opacity-60"
          >
            {portalLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <ExternalLink className="w-3 h-3" />}
            {es ? 'Gestionar facturación' : 'Manage billing'}
          </button>
        )}
      </div>

      {/* Upgrade options */}
      {currentTier !== 'enterprise' && (
        <div className="pt-4 border-t border-border/30 space-y-2">
          <p className="text-xs font-medium text-muted mb-3">
            {es ? 'Actualizar plan' : 'Upgrade plan'}
          </p>
          {(Object.entries(PLAN_META) as [PlanTier, typeof PLAN_META[PlanTier]][])
            .filter(([tier]) => tier !== currentTier && tier !== 'starter')
            .map(([tier, m]) => {
              const TierIcon = m.Icon;
              const isUpgrading = checkoutTier === tier;
              return (
                <button
                  key={tier}
                  onClick={() => upgrade(tier)}
                  disabled={!!checkoutTier}
                  className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-border bg-background hover:border-primary/30 hover:bg-primary/5 transition-all text-left disabled:opacity-60"
                >
                  <div className="flex items-center gap-3">
                    <TierIcon className="w-4 h-4" style={{ color: m.color }} />
                    <span className="text-sm font-medium text-foreground">{m.label}</span>
                    <span className="text-xs text-muted">${m.price}/mo</span>
                  </div>
                  {isUpgrading ? (
                    <Loader2 className="w-4 h-4 animate-spin text-muted" />
                  ) : (
                    <ArrowUpRight className="w-4 h-4 text-muted" />
                  )}
                </button>
              );
            })}
        </div>
      )}

      {!sub?.stripe_customer_id && (
        <div className="pt-4 border-t border-border/30">
          <button
            onClick={() => upgrade('pro')}
            disabled={!!checkoutTier}
            className="w-full py-2.5 rounded-xl text-sm font-semibold bg-primary text-white hover:bg-primary-hover transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {checkoutTier ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {es ? 'Suscribirse ahora' : 'Subscribe now'}
          </button>
        </div>
      )}
    </div>
  );
}

export default function SettingsPage() {
  const { language, setLanguage, setPlanTier } = useAppStore();
  const { webhookUrl, webhookSecret, webhookLogs, setWebhookUrl, setWebhookSecret, addLog, clearLogs, fetchWebhookConfig, syncWebhookConfig } = useWebhookStore();
  const t = dictionaries[language];
  const searchParams = useSearchParams();
  const checkoutSuccess = searchParams.get('checkout') === 'success';
  const [showSuccessBanner, setShowSuccessBanner] = useState(false);

  // Show success banner after checkout and sync plan from DB
  useEffect(() => {
    if (checkoutSuccess) {
      setShowSuccessBanner(true);
      // Sync the real plan tier from DB into Zustand (for any legacy code still reading it)
      async function syncPlan() {
        try {
          const supabase = createClient();
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) return;
          const { data: profile } = await supabase
            .from('user_profiles').select('org_id').eq('user_id', user.id).single();
          if (!profile?.org_id) return;
          const { data: org } = await supabase
            .from('organizations').select('plan_tier').eq('id', profile.org_id).single();
          if (org?.plan_tier) setPlanTier(org.plan_tier as PlanTier);
        } catch { /* keep existing */ }
      }
      syncPlan();
      // Auto-dismiss after 8s
      const timer = setTimeout(() => setShowSuccessBanner(false), 8000);
      return () => clearTimeout(timer);
    }
  }, [checkoutSuccess, setPlanTier]);

  // Cargar configuración de webhook desde Supabase al montar
  useEffect(() => {
    fetchWebhookConfig();
  }, [fetchWebhookConfig]);

  // Local state for mock settings
  const [profile, setProfile] = useState({ name: 'Admin RH', email: 'admin@worldbrain.com', company: 'WorldBrain Mexico' });
  const [timezone, setTimezone] = useState('America/Mexico_City');
  const [notifications, setNotifications] = useState({ newCandidate: true, interviewCompleted: true });
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success'>('idle');
  const [testingWebhook, setTestingWebhook] = useState(false);

  const handleSave = async () => {
    setSaveStatus('saving');
    // Sincronizar webhook config con Supabase
    await syncWebhookConfig();
    setSaveStatus('success');
    setTimeout(() => setSaveStatus('idle'), 2000);
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
      {/* Checkout success banner */}
      {showSuccessBanner && (
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          className="mb-6 flex items-center gap-3 px-5 py-4 bg-success/10 border border-success/20 rounded-2xl"
        >
          <CheckCircle2 className="w-5 h-5 text-success shrink-0" />
          <p className="text-sm font-medium text-foreground">
            {language === 'es'
              ? 'Tu suscripción se activó correctamente. Ya tienes acceso a las funciones de tu nuevo plan.'
              : 'Your subscription is now active. You have access to your new plan features.'}
          </p>
          <button onClick={() => setShowSuccessBanner(false)} className="ml-auto text-muted hover:text-foreground text-xs">
            &times;
          </button>
        </motion.div>
      )}

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
          <BillingCard language={language} />
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
