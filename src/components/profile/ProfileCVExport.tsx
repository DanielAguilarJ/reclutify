'use client';

import { useState } from 'react';
import { pdf, Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import type { Profile } from '@/types/profile';
import { useAppStore } from '@/store/appStore';
import { useToast } from '@/components/ui/Toast';
import { Download } from 'lucide-react';
import type { Language } from '@/store/appStore';

const styles = StyleSheet.create({
  page: { padding: 40, fontFamily: 'Helvetica', fontSize: 10, color: '#1f202c' },
  header: { marginBottom: 20, borderBottomWidth: 2, borderBottomColor: '#3b4cca', paddingBottom: 12 },
  name: { fontSize: 24, fontWeight: 'bold', color: '#1f202c', marginBottom: 4 },
  headline: { fontSize: 12, color: '#606384', marginBottom: 6 },
  contactRow: { flexDirection: 'row', gap: 16, fontSize: 9, color: '#878aae' },
  section: { marginBottom: 16 },
  sectionTitle: { fontSize: 13, fontWeight: 'bold', color: '#3b4cca', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 },
  entryTitle: { fontSize: 11, fontWeight: 'bold', color: '#1f202c' },
  entrySubtitle: { fontSize: 10, color: '#606384', marginBottom: 2 },
  entryDate: { fontSize: 9, color: '#878aae', marginBottom: 4 },
  entryDesc: { fontSize: 9.5, color: '#323346', lineHeight: 1.5 },
  skillsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  skillPill: { backgroundColor: '#e6ecff', borderRadius: 4, paddingHorizontal: 8, paddingVertical: 3, fontSize: 9, color: '#1552d6' },
  langRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, borderBottomWidth: 0.5, borderBottomColor: '#e2e8f0' },
  bio: { fontSize: 10, color: '#464862', lineHeight: 1.6, marginBottom: 16 },
});

function formatDate(dateStr: string | undefined | null, language: Language): string {
  if (!dateStr) return '';
  // Handle YYYY-MM format
  const parts = dateStr.split('-');
  if (parts.length >= 2) {
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    if (!isNaN(year) && !isNaN(month) && month >= 1 && month <= 12) {
      const date = new Date(year, month - 1);
      return date.toLocaleDateString(language === 'es' ? 'es-ES' : 'en-US', { month: 'short', year: 'numeric' });
    }
  }
  // Fallback: return as-is
  return dateStr;
}

function CVDocument({ profile, language }: { profile: Profile; language: Language }) {
  const t = (en: string, es: string) => language === 'es' ? es : en;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.name}>{profile.full_name}</Text>
          {profile.headline && <Text style={styles.headline}>{profile.headline}</Text>}
          <View style={styles.contactRow}>
            {profile.location && <Text>{profile.location}</Text>}
            {profile.website_url && <Text>{profile.website_url}</Text>}
          </View>
        </View>

        {/* Bio */}
        {profile.bio && (
          <View style={styles.section}>
            <Text style={styles.bio}>{profile.bio}</Text>
          </View>
        )}

        {/* Experience */}
        {profile.experience?.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('Experience', 'Experiencia')}</Text>
            {profile.experience.map((exp) => (
              <View key={exp.id} style={{ marginBottom: 10 }}>
                <Text style={styles.entryTitle}>{exp.title}</Text>
                <Text style={styles.entrySubtitle}>{exp.company}</Text>
                <Text style={styles.entryDate}>
                  {formatDate(exp.start_date, language)} — {exp.is_current ? t('Present', 'Presente') : formatDate(exp.end_date, language)}
                </Text>
                {exp.description && <Text style={styles.entryDesc}>{exp.description}</Text>}
              </View>
            ))}
          </View>
        )}

        {/* Education */}
        {profile.education?.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('Education', 'Educación')}</Text>
            {profile.education.map((edu) => (
              <View key={edu.id} style={{ marginBottom: 8 }}>
                <Text style={styles.entryTitle}>{edu.degree}</Text>
                <Text style={styles.entrySubtitle}>{edu.institution} — {edu.field}</Text>
                <Text style={styles.entryDate}>
                  {edu.start_year} — {edu.end_year || t('Present', 'Presente')}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Skills */}
        {profile.skills?.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('Skills', 'Habilidades')}</Text>
            <View style={styles.skillsRow}>
              {profile.skills.map((skill, i) => (
                <Text key={i} style={styles.skillPill}>{skill}</Text>
              ))}
            </View>
          </View>
        )}

        {/* Certifications */}
        {profile.certifications?.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('Certifications', 'Certificaciones')}</Text>
            {profile.certifications.map((cert) => (
              <View key={cert.id} style={{ marginBottom: 6 }}>
                <Text style={styles.entryTitle}>{cert.name}</Text>
                <Text style={styles.entrySubtitle}>{cert.issuer}</Text>
                {cert.issue_date && <Text style={styles.entryDate}>{formatDate(cert.issue_date, language)}</Text>}
              </View>
            ))}
          </View>
        )}

        {/* Languages */}
        {profile.languages?.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('Languages', 'Idiomas')}</Text>
            {profile.languages.map((lang) => (
              <View key={lang.id} style={styles.langRow}>
                <Text style={{ fontSize: 10 }}>{lang.language}</Text>
                <Text style={{ fontSize: 9, color: '#878aae', textTransform: 'capitalize' }}>{lang.proficiency}</Text>
              </View>
            ))}
          </View>
        )}
      </Page>
    </Document>
  );
}

interface ProfileCVExportProps {
  profile: Profile;
}

export default function ProfileCVExport({ profile }: ProfileCVExportProps) {
  const [generating, setGenerating] = useState(false);
  const language = useAppStore((s) => s.language);
  const { showToast } = useToast();
  const t = (en: string, es: string) => language === 'es' ? es : en;

  const handleDownload = async () => {
    setGenerating(true);
    try {
      const blob = await pdf(<CVDocument profile={profile} language={language} />).toBlob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${profile.full_name.replace(/\s+/g, '_')}_CV.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('PDF generation failed:', error);
      showToast('error', t('Failed to generate PDF', 'Error al generar el PDF'));
    }
    setGenerating(false);
  };

  return (
    <button
      onClick={handleDownload}
      disabled={generating}
      className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold
        bg-surface text-foreground border border-border
        hover:bg-surface-hover disabled:opacity-50 disabled:cursor-not-allowed
        transition-all"
    >
      <Download className="w-4 h-4" />
      {generating
        ? t('Generating...', 'Generando...')
        : t('Download CV', 'Descargar CV')}
    </button>
  );
}
