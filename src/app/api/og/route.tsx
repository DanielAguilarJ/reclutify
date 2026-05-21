import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';

export const runtime = 'edge';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const title = searchParams.get('title') || 'Reclutify';
  const subtitle = searchParams.get('subtitle') || 'AI Interview Platform';
  const type = searchParams.get('type') || 'default'; // default | profile | job

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #0f1117 0%, #1a1d2b 50%, #3b4cca 100%)',
          fontFamily: 'sans-serif',
        }}
      >
        {/* Logo area */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            marginBottom: '40px',
          }}
        >
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '14px',
              background: '#3b4cca',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: '16px',
            }}
          >
            <span style={{ fontSize: '28px', color: 'white', fontWeight: 700 }}>R</span>
          </div>
          <span style={{ fontSize: '32px', color: 'white', fontWeight: 600, opacity: 0.9 }}>
            Reclutify
          </span>
        </div>

        {/* Title */}
        <div
          style={{
            fontSize: type === 'profile' ? '48px' : '56px',
            fontWeight: 700,
            color: 'white',
            textAlign: 'center',
            maxWidth: '900px',
            lineHeight: 1.2,
            padding: '0 40px',
          }}
        >
          {title}
        </div>

        {/* Subtitle */}
        <div
          style={{
            fontSize: '24px',
            color: 'rgba(255,255,255,0.7)',
            textAlign: 'center',
            marginTop: '20px',
            maxWidth: '700px',
          }}
        >
          {subtitle}
        </div>

        {/* Bottom badge */}
        <div
          style={{
            position: 'absolute',
            bottom: '40px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: 'rgba(255,255,255,0.1)',
            padding: '8px 20px',
            borderRadius: '100px',
          }}
        >
          <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: '14px' }}>
            www.reclutify.com
          </span>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
}
