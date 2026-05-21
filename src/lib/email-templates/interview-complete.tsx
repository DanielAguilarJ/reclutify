import * as React from 'react';
import {
  Html,
  Body,
  Head,
  Heading,
  Container,
  Preview,
  Section,
  Text,
  Button,
  Img,
  Hr
} from '@react-email/components';

interface InterviewCompleteEmailProps {
  candidateName: string;
  roleTitle: string;
  score: number;
  recommendation: string;
  reportUrl: string;
}

export const InterviewCompleteEmail: React.FC<InterviewCompleteEmailProps> = ({
  candidateName,
  roleTitle,
  score,
  recommendation,
  reportUrl
}) => {
  const getRecommendationColor = (rec: string) => {
    if (rec === 'Strong Hire') return '#10B981';
    if (rec === 'Hire') return '#10B981';
    return '#EF4444';
  };

  return (
    <Html>
      <Head />
      <Preview>Reporte de Entrevista: {candidateName} - {String(score)}/100</Preview>
      <Body style={{ backgroundColor: '#f9f9fa', fontFamily: 'sans-serif' }}>
        <Container style={{ margin: '0 auto', padding: '20px 0 48px', width: '580px' }}>
          <Section style={{ padding: '24px', backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #eaeaea' }}>
            <Heading style={{ fontSize: '24px', color: '#111', fontWeight: 'bold' }}>
              Entrevista Completada ✅
            </Heading>
            
            <Text style={{ fontSize: '16px', color: '#444' }}>
              Hola, el candidato <strong>{candidateName}</strong> ha completado su entrevista con Zara para la vacante de <strong>{roleTitle}</strong>.
            </Text>

            <Section style={{ backgroundColor: '#f4f4f5', padding: '16px', borderRadius: '8px', margin: '24px 0' }}>
              <Text style={{ margin: '0 0 8px 0', fontSize: '14px', color: '#666' }}>Resumen de IA:</Text>
              <Text style={{ margin: '0 0 4px 0', fontSize: '24px', fontWeight: 'bold', color: '#111' }}>
                Score: {score}/100
              </Text>
              <Text style={{ margin: '0', fontSize: '16px', fontWeight: 'bold', color: getRecommendationColor(recommendation) }}>
                {recommendation}
              </Text>
            </Section>

            <Text style={{ fontSize: '14px', color: '#444' }}>
              El análisis completo incluye fortalezas, áreas de mejora y transcripción detallada.
            </Text>

            <Button
              href={reportUrl}
              style={{
                backgroundColor: '#3b4cca',
                color: '#fff',
                padding: '12px 20px',
                borderRadius: '8px',
                fontSize: '16px',
                textDecoration: 'none',
                display: 'inline-block',
                marginTop: '16px',
                fontWeight: 'bold'
              }}
            >
              Ver Reporte Completo
            </Button>

            <Hr style={{ borderColor: '#eaeaea', margin: '24px 0' }} />
            <Text style={{ fontSize: '12px', color: '#888' }}>
              Generado automáticamente por Reclutify AI.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
};

export default InterviewCompleteEmail;
