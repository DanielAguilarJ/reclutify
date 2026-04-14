import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const {
      webhookUrl,
      webhookSecret,
      candidateId,
      roleId,
      candidateName,
      overallScore,
      recommendation,
      topicScores,
      completedAt,
      isTest,
    } = await req.json();

    if (!webhookUrl) {
      return NextResponse.json(
        { error: 'Webhook URL is required' },
        { status: 400 }
      );
    }

    const payload = {
      event: 'interview.completed',
      data: {
        candidateId,
        roleId,
        candidateName,
        overallScore,
        recommendation,
        topicScores,
        completedAt: completedAt || new Date().toISOString(),
        isTest: isTest || false,
      },
      timestamp: new Date().toISOString(),
      source: 'reclutify',
    };

    const payloadString = JSON.stringify(payload);

    // Build headers
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'Reclutify-Webhook/1.0',
    };

    // HMAC-SHA256 signature if secret is provided
    if (webhookSecret) {
      const encoder = new TextEncoder();
      const keyData = encoder.encode(webhookSecret);
      const msgData = encoder.encode(payloadString);
      
      const cryptoKey = await crypto.subtle.importKey(
        'raw',
        keyData,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );
      
      const signature = await crypto.subtle.sign('HMAC', cryptoKey, msgData);
      const hexSignature = Array.from(new Uint8Array(signature))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
      
      headers['X-Signature-256'] = `sha256=${hexSignature}`;
    }

    // Send webhook
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers,
      body: payloadString,
      signal: AbortSignal.timeout(10000), // 10 second timeout
    });

    return NextResponse.json({
      success: response.ok,
      statusCode: response.status,
      statusText: response.statusText,
    });
  } catch (error: unknown) {
    console.error('Webhook delivery error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { 
        success: false, 
        statusCode: 0, 
        error: errorMessage 
      },
      { status: 200 } // Return 200 to the caller — the failure is in the webhook delivery, not our API
    );
  }
}
