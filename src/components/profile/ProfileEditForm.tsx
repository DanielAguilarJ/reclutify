'use client';

import { useState, useCallback } from 'react';
import type { Profile, ProfileExperience, ProfileEducation, ProfileUpdatePayload } from '@/types/profile';
import { updateProfile } from '@/app/actions/profile';

interface ProfileEditFormProps {
  profile: Profile;
}

export default function ProfileEditForm({ profile }: ProfileEditFormProps) {
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

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

  // ─── Save ───
  const handleSave = async () => {
    setSaving(true);
    setMessage(null);

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
    };

    const result = await updateProfile(payload);

    if (result.success) {
      setMessage({ type: 'success', text: '¡Perfil actualizado!' });
    } else {
      setMessage({ type: 'error', text: result.error || 'Error al guardar' });
    }

    setSaving(false);
    setTimeout(() => setMessage(null), 4000);
  };

  const inputClasses = "w-full px-4 py-3 rounded-xl border border-neutral-20 bg-white text-neutral-80 placeholder-neutral-30 focus:outline-none focus:ring-2 focus:ring-blue-50/30 focus:border-blue-50 transition-all";
  const labelClasses = "block text-sm font-semibold text-neutral-60 mb-1.5";

  return (
    <div className="space-y-8">
      {/* Status message */}
      {message && (
        <div className={`px-4 py-3 rounded-xl text-sm font-medium ${
          message.type === 'success'
            ? 'bg-green-10 text-green-60 border border-green-60/20'
            : 'bg-red-30/10 text-red-50 border border-red-50/20'
        }`}>
          {message.text}
        </div>
      )}

      {/* Basic Info */}
      <section className="bg-white rounded-2xl p-6 md:p-8 shadow-sm border border-neutral-10">
        <h2 className="text-lg font-bold text-neutral-80 mb-5">Información básica</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label className={labelClasses}>Nombre completo *</label>
            <input type="text" value={fullName} onChange={e => setFullName(e.target.value)}
              className={inputClasses} placeholder="Tu nombre completo" />
          </div>
          <div>
            <label className={labelClasses}>Titular profesional</label>
            <input type="text" value={headline} onChange={e => setHeadline(e.target.value)}
              className={inputClasses} placeholder="Ej: Senior Frontend Engineer at Google" maxLength={200} />
          </div>
          <div>
            <label className={labelClasses}>Ubicación</label>
            <input type="text" value={location} onChange={e => setLocation(e.target.value)}
              className={inputClasses} placeholder="Ej: Ciudad de México, MX" />
          </div>
          <div>
            <label className={labelClasses}>Sitio web</label>
            <input type="url" value={websiteUrl} onChange={e => setWebsiteUrl(e.target.value)}
              className={inputClasses} placeholder="https://..." />
          </div>
          <div className="md:col-span-2">
            <label className={labelClasses}>Bio</label>
            <textarea value={bio} onChange={e => setBio(e.target.value)}
              className={`${inputClasses} min-h-[120px] resize-y`}
              placeholder="Cuéntanos sobre tu trayectoria profesional..." maxLength={2000} />
            <p className="text-xs text-neutral-30 mt-1">{bio.length}/2000</p>
          </div>
        </div>

        {/* Toggles */}
        <div className="flex flex-wrap gap-6 mt-5 pt-5 border-t border-neutral-10">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={isOpenToWork} onChange={e => setIsOpenToWork(e.target.checked)}
              className="w-4 h-4 rounded border-neutral-30 text-blue-50 focus:ring-blue-50/30" />
            <span className="text-sm text-neutral-60">Abierto a nuevas oportunidades</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={publicEmail} onChange={e => setPublicEmail(e.target.checked)}
              className="w-4 h-4 rounded border-neutral-30 text-blue-50 focus:ring-blue-50/30" />
            <span className="text-sm text-neutral-60">Mostrar email públicamente</span>
          </label>
        </div>
      </section>

      {/* Skills */}
      <section className="bg-white rounded-2xl p-6 md:p-8 shadow-sm border border-neutral-10">
        <h2 className="text-lg font-bold text-neutral-80 mb-5">Habilidades</h2>
        <div className="flex gap-2 mb-4">
          <input type="text" value={skillInput}
            onChange={e => setSkillInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSkill(); } }}
            className={`${inputClasses} flex-1`}
            placeholder="Agrega una habilidad y presiona Enter" />
          <button onClick={addSkill}
            className="px-4 py-3 rounded-xl bg-blue-50 text-white font-semibold text-sm hover:bg-blue-40 transition-colors shrink-0">
            Agregar
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {skills.map((skill, i) => (
            <span key={i} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-blue-10 text-blue-60 border border-blue-20/50">
              {skill}
              <button onClick={() => removeSkill(i)} className="text-blue-40 hover:text-red-50 transition-colors">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </span>
          ))}
        </div>
      </section>

      {/* Experience */}
      <section className="bg-white rounded-2xl p-6 md:p-8 shadow-sm border border-neutral-10">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-neutral-80">Experiencia</h2>
          <button onClick={addExperience}
            className="px-4 py-2 rounded-xl text-sm font-semibold bg-neutral-10 text-neutral-60 hover:bg-neutral-20 transition-colors">
            + Agregar
          </button>
        </div>
        <div className="space-y-6">
          {experience.map((exp, i) => (
            <div key={exp.id} className="p-4 rounded-xl border border-neutral-10 bg-neutral-10/30 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className={labelClasses}>Puesto *</label>
                  <input type="text" value={exp.title} onChange={e => updateExperience(i, 'title', e.target.value)}
                    className={inputClasses} placeholder="Ej: Software Engineer" />
                </div>
                <div>
                  <label className={labelClasses}>Empresa *</label>
                  <input type="text" value={exp.company} onChange={e => updateExperience(i, 'company', e.target.value)}
                    className={inputClasses} placeholder="Ej: Google" />
                </div>
                <div>
                  <label className={labelClasses}>Fecha inicio</label>
                  <input type="month" value={exp.start_date} onChange={e => updateExperience(i, 'start_date', e.target.value)}
                    className={inputClasses} />
                </div>
                <div>
                  <label className={labelClasses}>Fecha fin</label>
                  <input type="month" value={exp.end_date || ''} disabled={exp.is_current}
                    onChange={e => updateExperience(i, 'end_date', e.target.value || null)}
                    className={`${inputClasses} ${exp.is_current ? 'opacity-50' : ''}`} />
                  <label className="flex items-center gap-1.5 mt-1.5 cursor-pointer">
                    <input type="checkbox" checked={exp.is_current}
                      onChange={e => { updateExperience(i, 'is_current', e.target.checked); if (e.target.checked) updateExperience(i, 'end_date', null); }}
                      className="w-3.5 h-3.5 rounded border-neutral-30 text-blue-50" />
                    <span className="text-xs text-neutral-40">Trabajo actual</span>
                  </label>
                </div>
              </div>
              <div>
                <label className={labelClasses}>Descripción</label>
                <textarea value={exp.description} onChange={e => updateExperience(i, 'description', e.target.value)}
                  className={`${inputClasses} min-h-[80px] resize-y`} placeholder="Describe tus responsabilidades y logros..." />
              </div>
              <button onClick={() => removeExperience(i)}
                className="text-sm text-red-50 hover:text-red-60 font-medium transition-colors">
                Eliminar experiencia
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Education */}
      <section className="bg-white rounded-2xl p-6 md:p-8 shadow-sm border border-neutral-10">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-neutral-80">Educación</h2>
          <button onClick={addEducation}
            className="px-4 py-2 rounded-xl text-sm font-semibold bg-neutral-10 text-neutral-60 hover:bg-neutral-20 transition-colors">
            + Agregar
          </button>
        </div>
        <div className="space-y-6">
          {education.map((edu, i) => (
            <div key={edu.id} className="p-4 rounded-xl border border-neutral-10 bg-neutral-10/30 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className={labelClasses}>Institución *</label>
                  <input type="text" value={edu.institution} onChange={e => updateEducation(i, 'institution', e.target.value)}
                    className={inputClasses} placeholder="Ej: UNAM" />
                </div>
                <div>
                  <label className={labelClasses}>Título *</label>
                  <input type="text" value={edu.degree} onChange={e => updateEducation(i, 'degree', e.target.value)}
                    className={inputClasses} placeholder="Ej: Ingeniería en Sistemas" />
                </div>
                <div>
                  <label className={labelClasses}>Campo de estudio</label>
                  <input type="text" value={edu.field} onChange={e => updateEducation(i, 'field', e.target.value)}
                    className={inputClasses} placeholder="Ej: Ciencias Computacionales" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelClasses}>Año inicio</label>
                    <input type="number" value={edu.start_year} onChange={e => updateEducation(i, 'start_year', parseInt(e.target.value) || 0)}
                      className={inputClasses} min={1950} max={2030} />
                  </div>
                  <div>
                    <label className={labelClasses}>Año fin</label>
                    <input type="number" value={edu.end_year || ''} onChange={e => updateEducation(i, 'end_year', e.target.value ? parseInt(e.target.value) : null)}
                      className={inputClasses} min={1950} max={2035} placeholder="Actual" />
                  </div>
                </div>
              </div>
              <button onClick={() => removeEducation(i)}
                className="text-sm text-red-50 hover:text-red-60 font-medium transition-colors">
                Eliminar educación
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Save button */}
      <div className="flex justify-end gap-3 pb-8">
        <a href={`/profile/${profile.username}`}
          className="px-6 py-3 rounded-xl text-sm font-semibold bg-white text-neutral-60 border border-neutral-20 hover:bg-neutral-10 transition-colors">
          Ver perfil
        </a>
        <button onClick={handleSave} disabled={saving}
          className="px-8 py-3 rounded-xl text-sm font-semibold bg-blue-50 text-white hover:bg-blue-40 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm hover:shadow-md">
          {saving ? 'Guardando...' : 'Guardar cambios'}
        </button>
      </div>
    </div>
  );
}
