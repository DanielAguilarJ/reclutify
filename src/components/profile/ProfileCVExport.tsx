'use client';

import { useState } from 'react';
import { pdf, Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import type { Profile } from '@/types/profile';
import { useAppStore } from '@/store/appStore';
import { Download } from 'lucide-react';

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

function CVDocument({ profile }: { profile: Profile }) {
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
            <Text style={styles.sectionTitle}>Experience</Text>
            {profile.experience.map((exp) => (
              <View key={exp.id} style={{ marginBottom: 10 }}>
                <Text style={styles.entryTitle}>{exp.title}</Text>
                <Text style={styles.entrySubtitle}>{exp.company}</Text>
                <Text style={styles.entryDate}>
                  {exp.start_date} — {exp.is_current ? 'Present' : exp.end_date || ''}
                </Text>
                {exp.description && <Text style={styles.entryDesc}>{exp.description}</Text>}
              </View>
            ))}
          </View>
        )}

        {/* Education */}
        {profile.education?.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Education</Text>
            {profile.education.map((edu) => (
              <View key={edu.id} style={{ marginBottom: 8 }}>
                <Text style={styles.entryTitle}>{edu.degree}</Text>
                <Text style={styles.entrySubtitle}>{edu.institution} — {edu.field}</Text>
                <Text style={styles.entryDate}>
                  {edu.start_year} — {edu.end_year || 'Present'}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Skills */}
        {profile.skills?.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Skills</Text>
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
            <Text style={styles.sectionTitle}>Certifications</Text>
            {profile.certifications.map((cert) => (
              <View key={cert.id} style={{ marginBottom: 6 }}>
                <Text style={styles.entryTitle}>{cert.name}</Text>
                <Text style={styles.entrySubtitle}>{cert.issuer}</Text>
                {cert.issue_date && <Text style={styles.entryDate}>{cert.issue_date}</Text>}
              </View>
            ))}
          </View>
        )}

        {/* Languages */}
        {profile.languages?.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Languages</Text>
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

  const handleDownload = async () => {
    setGenerating(true);
    try {
      const blob = await pdf(<CVDocument profile={profile} />).toBlob();
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
        ? (language === 'es' ? 'Generando...' : 'Generating...')
        : (language === 'es' ? 'Descargar CV' : 'Download CV')}
    </button>
  );
}
