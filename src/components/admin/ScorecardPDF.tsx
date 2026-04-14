'use client';

import { useState, useEffect } from 'react';
import { Document, Page, Text, View, StyleSheet, PDFDownloadLink } from '@react-pdf/renderer';
import type { CandidateResult, Evaluation } from '@/types';
import { FileText } from 'lucide-react';

const styles = StyleSheet.create({
  page: { padding: 40, fontFamily: 'Helvetica', backgroundColor: '#FFFFFF' },
  header: { marginBottom: 30, borderBottomWidth: 1, borderBottomColor: '#EEEEEE', paddingBottom: 15 },
  brand: { fontSize: 18, color: '#3b4cca', fontWeight: 800, marginBottom: 8 },
  title: { fontSize: 24, color: '#111111', fontWeight: 700, marginBottom: 4 },
  subtitle: { fontSize: 14, color: '#666666' },
  flexRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  
  scoreBadgeBox: { 
    backgroundColor: '#F3F4F6', 
    padding: 15, 
    borderRadius: 8, 
    alignItems: 'center', 
    justifyContent: 'center',
    width: 120 
  },
  scoreValue: { fontSize: 32, fontWeight: 700, color: '#10B981' },
  scoreLabel: { fontSize: 10, color: '#666666', textTransform: 'uppercase' },

  section: { marginTop: 20, marginBottom: 10 },
  sectionTitle: { fontSize: 14, fontWeight: 700, color: '#111111', marginBottom: 12, borderBottomWidth: 1, borderBottomColor: '#EEEEEE', paddingBottom: 5 },
  
  textNormal: { fontSize: 11, color: '#444444', lineHeight: 1.5 },
  
  listItem: { flexDirection: 'row', marginBottom: 6 },
  bullet: { width: 10, fontSize: 11, color: '#10B981' },
  bulletBad: { width: 10, fontSize: 11, color: '#EF4444' },
  listText: { flex: 1, fontSize: 11, color: '#444444', lineHeight: 1.4 },

  recommendationBadge: { padding: 8, borderRadius: 4, alignSelf: 'flex-start', marginTop: 10 },
  recommendationText: { fontSize: 12, fontWeight: 700 },
  
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 10 },
  gridItem: { width: '50%', marginBottom: 15, paddingRight: 15 }
});

const ScorecardPDFTemplate = ({ candidate, evaluation }: { candidate: CandidateResult, evaluation: Evaluation }) => {
  const getRecColor = (rec: string) => {
    switch (rec) {
      case 'Strong Hire': return { bg: '#cffafe', text: '#0891b2' };
      case 'Hire': return { bg: '#dcfce7', text: '#15803d' };
      default: return { bg: '#fee2e2', text: '#b91c1c' };
    }
  };
  const recStyle = getRecColor(evaluation.recommendation);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.brand}>RECLUTIFY AI</Text>
          <View style={styles.flexRow}>
            <View>
              <Text style={styles.title}>{evaluation.candidateName}</Text>
              <Text style={styles.subtitle}>{candidate.roleTitle} | {new Date(candidate.date).toLocaleDateString()}</Text>
            </View>
            <View style={styles.scoreBadgeBox}>
              <Text style={styles.scoreValue}>{evaluation.overallScore}/100</Text>
              <Text style={styles.scoreLabel}>Overall Score</Text>
            </View>
          </View>
          <View style={[styles.recommendationBadge, { backgroundColor: recStyle.bg }]}>
            <Text style={[styles.recommendationText, { color: recStyle.text }]}>Recommendation: {evaluation.recommendation}</Text>
          </View>
        </View>

        {/* Executive Summary */}
        {evaluation.executiveSummary && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Executive Summary</Text>
            <Text style={styles.textNormal}>{evaluation.executiveSummary}</Text>
          </View>
        )}

        {/* Pros and Cons */}
        <View style={styles.grid}>
          <View style={styles.gridItem}>
            <Text style={styles.sectionTitle}>Strengths</Text>
            {evaluation.pros.map((pro, i) => (
              <View key={i} style={styles.listItem}>
                <Text style={styles.bullet}>•</Text>
                <Text style={styles.listText}>{pro}</Text>
              </View>
            ))}
          </View>
          
          <View style={styles.gridItem}>
            <Text style={styles.sectionTitle}>Areas for Improvement</Text>
            {evaluation.cons.map((con, i) => (
              <View key={i} style={styles.listItem}>
                <Text style={styles.bulletBad}>•</Text>
                <Text style={styles.listText}>{con}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Topic Scores */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Topic Evaluation</Text>
          {Object.entries(evaluation.topicScores).map(([topic, score], i) => (
            <View key={i} style={{ flexDirection: 'row', marginBottom: 8, alignItems: 'center' }}>
               <Text style={{ width: 150, fontSize: 11, color: '#444' }}>{topic}</Text>
               <View style={{ flex: 1, height: 8, backgroundColor: '#EEEEEE', borderRadius: 4, marginRight: 10 }}>
                  <View style={{ width: `${score}%`, height: '100%', backgroundColor: score >= 80 ? '#10B981' : score >= 60 ? '#F59E0B' : '#EF4444', borderRadius: 4 }} />
               </View>
               <Text style={{ width: 30, fontSize: 10, color: '#111', fontWeight: 700 }}>{score}</Text>
            </View>
          ))}
        </View>

        {/* Risks */}
        {evaluation.hiringRisks && evaluation.hiringRisks.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Hiring Risks</Text>
            {evaluation.hiringRisks.map((risk, i) => (
              <View key={i} style={styles.listItem}>
                <Text style={styles.bulletBad}>⚠</Text>
                <Text style={styles.listText}>{risk}</Text>
              </View>
            ))}
          </View>
        )}
      </Page>
    </Document>
  );
};

export default function PDFExportButton({ candidate, language }: { candidate: CandidateResult, language: string }) {
  const [isClient, setIsClient] = useState(false);
  useEffect(() => setIsClient(true), []);

  if (!isClient || !candidate.evaluation) return null;

  return (
    <PDFDownloadLink 
      document={<ScorecardPDFTemplate candidate={candidate} evaluation={candidate.evaluation} />}
      fileName={`Scorecard_${candidate.candidate.name.replace(/\s+/g, '_')}.pdf`}
      className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all bg-[#3b4cca]/10 text-[#3b4cca] hover:bg-[#3b4cca]/20 border border-[#3b4cca]/20 cursor-pointer"
    >
      {({ loading }) => (
        <>
          <FileText className="h-3 w-3" />
          {loading ? (language === 'es' ? 'Generando...' : 'Generating...') : (language === 'es' ? 'Exportar PDF' : 'Export PDF')}
        </>
      )}
    </PDFDownloadLink>
  );
}
