'use client';

import { useState, useCallback, useRef } from 'react';
import type { Profile, ProfileExperience, ProfileEducation, ProfileCertification, ProfileLanguage, ProfileUpdatePayload } from '@/types/profile';
import { updateProfile, uploadProfileImage } from '@/app/actions/profile';
import { useToast } from '@/components/ui/Toast';
import { useAppStore } from '@/store/appStore';
import { Camera, Upload, X, Plus, Award, Globe } from 'lucide-react';

interface ProfileEditFormProps {
  profile: Profile;
}

export default function ProfileEditForm({ profile }: ProfileEditFormProps) {
  const [saving, setSaving] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url);
  const [bannerUrl, setBannerUrl] = useState(profile.banner_url);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  const { showToast } = useToast();
  const language = useAppStore((s) => s.language);
  const t = (en: string, es: string) => language === 'es' ? es : en;

  // Form state
  const [fullName, setFullName] = useState(profile.full_name);
  const [headline, setHeadline] = useState(profile.headline || '');
  const [bio, setBio] = useState(profile.bio || '');
  const [location, setLocation] = useState(profile.location || '');
  const [websiteUrl, setWebsiteUrl] = useState(profile.website_url || '');
  const [isOpenToWork, setIsOpenToWork] = useState(profile.is_open_to_work);
  const [publicEmail, setPublicEmail] = useState(profile.public_email);
  const [skills, setSkills] = useState<string[]>(profile.skills || []);
  const [skillInput, setSkillInput] = useState('');
  const [experience, setExperience] = useState<ProfileExperience[]>(profile.experience || []);
  const [education, setEducation] = useState<ProfileEducation[]>(profile.education || []);
  const [certifications, setCertifications] = useState<ProfileCertification[]>(profile.certifications || []);
  const [languages, setLanguages] = useState<ProfileLanguage[]>(profile.languages || []);

  // ─── Image upload ───
  const handleImageUpload = async (type: 'avatar' | 'banner', file: File) => {
    const setUploading = type === 'avatar' ? setUploadingAvatar : setUploadingBanner;
    setUploading(true);

    const formData = new FormData();
    formData.append('file', file);

    const result = await uploadProfileImage(type, formData);

    if (result.success && result.url) {
      if (type === 'avatar') setAvatarUrl(result.url);
      else setBannerUrl(result.url);
      showToast('success', t('Image uploaded!', 'Imagen subida!'));
    } else {
      showToast('error', result.error || t('Upload failed', 'Error al subir'));
    }

    setUploading(false);
  };

  const handleFileChange = (type: 'avatar' | 'banner') => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleImageUpload(type, file);
  };

  // ─── Skills management ───
  const addSkill = useCallback(() => {
    const trimmed = skillInput.trim();
    if (trimmed && !skills.includes(trimmed) && skills.length < 50) {
      setSkills(prev => [...prev, trimmed]);
      setSkillInput('');
    }
  }, [skillInput, skills]);

  const removeSkill = (index: number) => {
    setSkills(prev => prev.filter((_, i) => i !== index));
  };

  // ─── Experience management ───
  const addExperience = () => {
    setExperience(prev => [...prev, {
      id: crypto.randomUUID(),
      title: '', company: '', start_date: '', end_date: null,
      description: '', is_current: false,
    }]);
  };

  const updateExperience = (index: number, field: keyof ProfileExperience, value: string | boolean | null) => {
    setExperience(prev => prev.map((exp, i) =>
      i === index ? { ...exp, [field]: value } : exp
    ));
  };

  const removeExperience = (index: number) => {
    setExperience(prev => prev.filter((_, i) => i !== index));
  };

  // ─── Education management ───
  const addEducation = () => {
    setEducation(prev => [...prev, {
      id: crypto.randomUUID(),
      institution: '', degree: '', field: '',
      start_year: new Date().getFullYear(), end_year: null,
    }]);
  };

  const updateEducation = (index: number, field: keyof ProfileEducation, value: string | number | null) => {
    setEducation(prev => prev.map((edu, i) =>
      i === index ? { ...edu, [field]: value } : edu
    ));
  };

  const removeEducation = (index: number) => {
    setEducation(prev => prev.filter((_, i) => i !== index));
  };

  // ─── Certifications management ───
  const addCertification = () => {
    setCertifications(prev => [...prev, {
      id: crypto.randomUUID(),
      name: '', issuer: '', issue_date: null, expiry_date: null, credential_url: null,
    }]);
  };

  const updateCertification = (index: number, field: keyof ProfileCertification, value: string | null) => {
    setCertifications(prev => prev.map((cert, i) =>
      i === index ? { ...cert, [field]: value } : cert
    ));
  };

  const removeCertification = (index: number) => {
    setCertifications(prev => prev.filter((_, i) => i !== index));
  };

  // ─── Languages management ───
  const addLanguage = () => {
    setLanguages(prev => [...prev, {
      id: crypto.randomUUID(),
      language: '', proficiency: 'intermediate' as const,
    }]);
  };

  const updateLanguage = (index: number, field: keyof ProfileLanguage, value: string) => {
    setLanguages(prev => prev.map((lang, i) =>
      i === index ? { ...lang, [field]: value } : lang
    ));
  };

  const removeLanguage = (index: number) => {
    setLanguages(prev => prev.filter((_, i) => i !== index));
  };

  // ─── Save ───
  const handleSave = async () => {
    if (!fullName.trim()) {
      showToast('error', t('Name is required', 'El nombre es requerido'));
      return;
    }
    setSaving(true);

    const payload: ProfileUpdatePayload = {
      full_name: fullName,
      headline,
      bio,
      location,
      website_url: websiteUrl,
      is_open_to_work: isOpenToWork,
      public_email: publicEmail,
      skills,
      experience: experience.filter(e => e.title && e.company),
      education: education.filter(e => e.institution && e.degree),
      certifications: certifications.filter(c => c.name && c.issuer),
      languages: languages.filter(l => l.language),
    };

    const result = await updateProfile(payload);

    if (result.success) {
      showToast('success', t('Profile updated!', '¡Perfil actualizado!'));
    } else {
      showToast('error', result.error || t('Error saving', 'Error al guardar'));
    }

    setSaving(false);
  };

  const inputClasses = "w-full px-4 py-3 rounded-xl border border-border bg-card text-foreground placeholder-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all";
  const labelClasses = "block text-sm font-semibold text-foreground/70 mb-1.5";

  return (
    <div className="space-y-8">
      {/* Avatar & Banner Upload */}
      <section className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
        {/* Banner */}
        <div className="relative h-40 md:h-52 bg-gradient-to-r from-blue-60 via-purple-60 to-cyan-50">
          {bannerUrl && (
            <img src={bannerUrl} alt="" className="w-full h-full object-cover" />
          )}
          <button
            onClick={() => bannerInputRef.current?.click()}
            disabled={uploadingBanner}
            className="absolute bottom-3 right-3 flex items-center gap-2 px-3 py-2 rounded-xl 
              bg-black/50 text-white text-xs font-medium hover:bg-black/70 transition-colors backdrop-blur-sm"
          >
            {uploadingBanner ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Camera className="w-4 h-4" />
            )}
            {t('Change banner', 'Cambiar banner')}
          </button>
          <input ref={bannerInputRef} type="file" accept="image/jpeg,image/png,image/webp"
            onChange={handleFileChange('banner')} className="hidden" />
        </div>

        {/* Avatar */}
        <div className="px-6 md:px-8 pb-6">
          <div className="flex items-end gap-4 -mt-12">
            <div className="relative">
              <div className="w-24 h-24 rounded-full border-4 border-card shadow-lg overflow-hidden bg-surface">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-2xl font-bold text-muted bg-gradient-to-br from-blue-10 to-purple-10">
                    {fullName.charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
              <button
                onClick={() => avatarInputRef.current?.click()}
                disabled={uploadingAvatar}
                className="absolute -bottom-1 -right-1 w-8 h-8 flex items-center justify-center rounded-full
                  bg-primary text-white shadow-md hover:bg-primary-hover transition-colors"
              >
                {uploadingAvatar ? (
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Camera className="w-3.5 h-3.5" />
                )}
              </button>
              <input ref={avatarInputRef} type="file" accept="image/jpeg,image/png,image/webp"
                onChange={handleFileChange('avatar')} className="hidden" />
            </div>
            <div className="pb-1">
              <p className="text-sm text-muted">
                {t('Upload a professional photo (max 2MB)', 'Sube una foto profesional (max 2MB)')}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Basic Info */}
      <section className="bg-card rounded-2xl p-6 md:p-8 shadow-sm border border-border">
        <h2 className="text-lg font-bold text-foreground mb-5">{t('Basic information', 'Información básica')}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label className={labelClasses}>{t('Full name *', 'Nombre completo *')}</label>
            <input type="text" value={fullName} onChange={e => setFullName(e.target.value)}
              className={inputClasses} placeholder={t('Your full name', 'Tu nombre completo')} />
          </div>
          <div>
            <label className={labelClasses}>{t('Professional headline', 'Titular profesional')}</label>
            <input type="text" value={headline} onChange={e => setHeadline(e.target.value)}
              className={inputClasses} placeholder="Ej: Senior Frontend Engineer at Google" maxLength={200} />
          </div>
          <div>
            <label className={labelClasses}>{t('Location', 'Ubicación')}</label>
            <input type="text" value={location} onChange={e => setLocation(e.target.value)}
              className={inputClasses} placeholder="Ej: Ciudad de México, MX" />
          </div>
          <div>
            <label className={labelClasses}>{t('Website', 'Sitio web')}</label>
            <input type="url" value={websiteUrl} onChange={e => setWebsiteUrl(e.target.value)}
              className={inputClasses} placeholder="https://..." />
          </div>
          <div className="md:col-span-2">
            <label className={labelClasses}>{t('Bio', 'Bio')}</label>
            <textarea value={bio} onChange={e => setBio(e.target.value)}
              className={`${inputClasses} min-h-[120px] resize-y`}
              placeholder={t('Tell us about your professional journey...', 'Cuéntanos sobre tu trayectoria profesional...')} maxLength={2000} />
            <p className="text-xs text-muted mt-1">{bio.length}/2000</p>
          </div>
        </div>

        {/* Toggles */}
        <div className="flex flex-wrap gap-6 mt-5 pt-5 border-t border-border">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={isOpenToWork} onChange={e => setIsOpenToWork(e.target.checked)}
              className="w-4 h-4 rounded border-border text-primary focus:ring-primary/30" />
            <span className="text-sm text-foreground/70">{t('Open to new opportunities', 'Abierto a nuevas oportunidades')}</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={publicEmail} onChange={e => setPublicEmail(e.target.checked)}
              className="w-4 h-4 rounded border-border text-primary focus:ring-primary/30" />
            <span className="text-sm text-foreground/70">{t('Show email publicly', 'Mostrar email públicamente')}</span>
          </label>
        </div>
      </section>

      {/* Skills */}
      <section className="bg-card rounded-2xl p-6 md:p-8 shadow-sm border border-border">
        <h2 className="text-lg font-bold text-foreground mb-5">{t('Skills', 'Habilidades')}</h2>
        <div className="flex gap-2 mb-4">
          <input type="text" value={skillInput}
            onChange={e => setSkillInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSkill(); } }}
            className={`${inputClasses} flex-1`}
            placeholder={t('Add a skill and press Enter', 'Agrega una habilidad y presiona Enter')} />
          <button onClick={addSkill}
            className="px-4 py-3 rounded-xl bg-primary text-white font-semibold text-sm hover:bg-primary-hover transition-colors shrink-0">
            {t('Add', 'Agregar')}
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {skills.map((skill, i) => (
            <span key={`${skill}-${i}`} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-primary-light text-primary border border-primary/20">
              {skill}
              <button onClick={() => removeSkill(i)} className="text-primary/60 hover:text-danger transition-colors">
                <X className="w-3.5 h-3.5" />
              </button>
            </span>
          ))}
        </div>
      </section>

      {/* Experience */}
      <section className="bg-card rounded-2xl p-6 md:p-8 shadow-sm border border-border">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-foreground">{t('Experience', 'Experiencia')}</h2>
          <button onClick={addExperience}
            className="flex items-center gap-1 px-4 py-2 rounded-xl text-sm font-semibold bg-surface text-foreground/70 hover:bg-surface-hover transition-colors">
            <Plus className="w-4 h-4" /> {t('Add', 'Agregar')}
          </button>
        </div>
        <div className="space-y-6">
          {experience.map((exp, i) => (
            <div key={exp.id} className="p-4 rounded-xl border border-border bg-surface/30 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className={labelClasses}>{t('Position *', 'Puesto *')}</label>
                  <input type="text" value={exp.title} onChange={e => updateExperience(i, 'title', e.target.value)}
                    className={inputClasses} placeholder="Ej: Software Engineer" />
                </div>
                <div>
                  <label className={labelClasses}>{t('Company *', 'Empresa *')}</label>
                  <input type="text" value={exp.company} onChange={e => updateExperience(i, 'company', e.target.value)}
                    className={inputClasses} placeholder="Ej: Google" />
                </div>
                <div>
                  <label className={labelClasses}>{t('Start date', 'Fecha inicio')}</label>
                  <input type="month" value={exp.start_date} onChange={e => updateExperience(i, 'start_date', e.target.value)}
                    className={inputClasses} />
                </div>
                <div>
                  <label className={labelClasses}>{t('End date', 'Fecha fin')}</label>
                  <input type="month" value={exp.end_date || ''} disabled={exp.is_current}
                    onChange={e => updateExperience(i, 'end_date', e.target.value || null)}
                    className={`${inputClasses} ${exp.is_current ? 'opacity-50' : ''}`} />
                  <label className="flex items-center gap-1.5 mt-1.5 cursor-pointer">
                    <input type="checkbox" checked={exp.is_current}
                      onChange={e => { updateExperience(i, 'is_current', e.target.checked); if (e.target.checked) updateExperience(i, 'end_date', null); }}
                      className="w-3.5 h-3.5 rounded border-border text-primary" />
                    <span className="text-xs text-muted">{t('Current job', 'Trabajo actual')}</span>
                  </label>
                </div>
              </div>
              <div>
                <label className={labelClasses}>{t('Description', 'Descripción')}</label>
                <textarea value={exp.description} onChange={e => updateExperience(i, 'description', e.target.value)}
                  className={`${inputClasses} min-h-[80px] resize-y`} placeholder={t('Describe your responsibilities...', 'Describe tus responsabilidades y logros...')} />
              </div>
              <button onClick={() => removeExperience(i)}
                className="text-sm text-danger hover:text-danger/80 font-medium transition-colors">
                {t('Remove experience', 'Eliminar experiencia')}
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Education */}
      <section className="bg-card rounded-2xl p-6 md:p-8 shadow-sm border border-border">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-foreground">{t('Education', 'Educación')}</h2>
          <button onClick={addEducation}
            className="flex items-center gap-1 px-4 py-2 rounded-xl text-sm font-semibold bg-surface text-foreground/70 hover:bg-surface-hover transition-colors">
            <Plus className="w-4 h-4" /> {t('Add', 'Agregar')}
          </button>
        </div>
        <div className="space-y-6">
          {education.map((edu, i) => (
            <div key={edu.id} className="p-4 rounded-xl border border-border bg-surface/30 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className={labelClasses}>{t('Institution *', 'Institución *')}</label>
                  <input type="text" value={edu.institution} onChange={e => updateEducation(i, 'institution', e.target.value)}
                    className={inputClasses} placeholder="Ej: UNAM" />
                </div>
                <div>
                  <label className={labelClasses}>{t('Degree *', 'Título *')}</label>
                  <input type="text" value={edu.degree} onChange={e => updateEducation(i, 'degree', e.target.value)}
                    className={inputClasses} placeholder="Ej: Ingeniería en Sistemas" />
                </div>
                <div>
                  <label className={labelClasses}>{t('Field of study', 'Campo de estudio')}</label>
                  <input type="text" value={edu.field} onChange={e => updateEducation(i, 'field', e.target.value)}
                    className={inputClasses} placeholder="Ej: Ciencias Computacionales" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelClasses}>{t('Start year', 'Año inicio')}</label>
                    <input type="number" value={edu.start_year} onChange={e => updateEducation(i, 'start_year', parseInt(e.target.value) || 0)}
                      className={inputClasses} min={1950} max={2030} />
                  </div>
                  <div>
                    <label className={labelClasses}>{t('End year', 'Año fin')}</label>
                    <input type="number" value={edu.end_year || ''} onChange={e => updateEducation(i, 'end_year', e.target.value ? parseInt(e.target.value) : null)}
                      className={inputClasses} min={1950} max={2035} placeholder={t('Present', 'Actual')} />
                  </div>
                </div>
              </div>
              <button onClick={() => removeEducation(i)}
                className="text-sm text-danger hover:text-danger/80 font-medium transition-colors">
                {t('Remove education', 'Eliminar educación')}
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Certifications */}
      <section className="bg-card rounded-2xl p-6 md:p-8 shadow-sm border border-border">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
            <Award className="w-5 h-5 text-primary" />
            {t('Certifications', 'Certificaciones')}
          </h2>
          <button onClick={addCertification}
            className="flex items-center gap-1 px-4 py-2 rounded-xl text-sm font-semibold bg-surface text-foreground/70 hover:bg-surface-hover transition-colors">
            <Plus className="w-4 h-4" /> {t('Add', 'Agregar')}
          </button>
        </div>
        <div className="space-y-6">
          {certifications.map((cert, i) => (
            <div key={cert.id} className="p-4 rounded-xl border border-border bg-surface/30 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className={labelClasses}>{t('Certification name *', 'Nombre certificación *')}</label>
                  <input type="text" value={cert.name} onChange={e => updateCertification(i, 'name', e.target.value)}
                    className={inputClasses} placeholder="Ej: AWS Solutions Architect" />
                </div>
                <div>
                  <label className={labelClasses}>{t('Issuer *', 'Emisor *')}</label>
                  <input type="text" value={cert.issuer} onChange={e => updateCertification(i, 'issuer', e.target.value)}
                    className={inputClasses} placeholder="Ej: Amazon Web Services" />
                </div>
                <div>
                  <label className={labelClasses}>{t('Issue date', 'Fecha emisión')}</label>
                  <input type="month" value={cert.issue_date || ''} onChange={e => updateCertification(i, 'issue_date', e.target.value || null)}
                    className={inputClasses} />
                </div>
                <div>
                  <label className={labelClasses}>{t('Credential URL', 'URL de credencial')}</label>
                  <input type="url" value={cert.credential_url || ''} onChange={e => updateCertification(i, 'credential_url', e.target.value || null)}
                    className={inputClasses} placeholder="https://..." />
                </div>
              </div>
              <button onClick={() => removeCertification(i)}
                className="text-sm text-danger hover:text-danger/80 font-medium transition-colors">
                {t('Remove certification', 'Eliminar certificación')}
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Languages */}
      <section className="bg-card rounded-2xl p-6 md:p-8 shadow-sm border border-border">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
            <Globe className="w-5 h-5 text-primary" />
            {t('Languages', 'Idiomas')}
          </h2>
          <button onClick={addLanguage}
            className="flex items-center gap-1 px-4 py-2 rounded-xl text-sm font-semibold bg-surface text-foreground/70 hover:bg-surface-hover transition-colors">
            <Plus className="w-4 h-4" /> {t('Add', 'Agregar')}
          </button>
        </div>
        <div className="space-y-4">
          {languages.map((lang, i) => (
            <div key={lang.id} className="flex items-center gap-3 p-3 rounded-xl border border-border bg-surface/30">
              <div className="flex-1">
                <input type="text" value={lang.language} onChange={e => updateLanguage(i, 'language', e.target.value)}
                  className={inputClasses} placeholder={t('Language name', 'Nombre del idioma')} />
              </div>
              <select
                value={lang.proficiency}
                onChange={e => updateLanguage(i, 'proficiency', e.target.value)}
                className="px-3 py-3 rounded-xl border border-border bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="native">{t('Native', 'Nativo')}</option>
                <option value="fluent">{t('Fluent', 'Fluido')}</option>
                <option value="advanced">{t('Advanced', 'Avanzado')}</option>
                <option value="intermediate">{t('Intermediate', 'Intermedio')}</option>
                <option value="basic">{t('Basic', 'Básico')}</option>
              </select>
              <button onClick={() => removeLanguage(i)}
                className="p-2 text-danger hover:bg-danger/10 rounded-lg transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Save button */}
      <div className="flex justify-end gap-3 pb-8">
        <a href={`/profile/${profile.username}`}
          className="px-6 py-3 rounded-xl text-sm font-semibold bg-card text-foreground/70 border border-border hover:bg-surface transition-colors">
          {t('View profile', 'Ver perfil')}
        </a>
        <button onClick={handleSave} disabled={saving}
          className="px-8 py-3 rounded-xl text-sm font-semibold bg-primary text-white hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm hover:shadow-md">
          {saving ? t('Saving...', 'Guardando...') : t('Save changes', 'Guardar cambios')}
        </button>
      </div>
    </div>
  );
}
