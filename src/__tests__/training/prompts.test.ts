import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { POST as postChat } from '@/app/api/training/chat/route';
import { POST as postGenerate } from '@/app/api/training/generate-modules/route';
import { POST as postHire } from '@/app/api/training/hire-candidate/route';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

interface FluentMock {
  select: (cols?: string) => FluentMock;
  eq: (col: string, val: unknown) => FluentMock;
  in: (col: string, vals: unknown[]) => FluentMock;
  is: (col: string, val: unknown) => FluentMock;
  limit: (n: number) => FluentMock;
  order: (col: string, opt?: unknown) => FluentMock;
  textSearch: (col: string, val: unknown) => FluentMock;
  maybeSingle: () => Promise<unknown>;
  single: () => Promise<unknown>;
  then: (resolve: (val: unknown) => unknown) => Promise<unknown>;
}

const createFluentMock = (resolvedValue: unknown, errorValue: unknown = null): FluentMock => {
  const fluent: FluentMock = {
    select: () => fluent,
    eq: () => fluent,
    in: () => fluent,
    is: () => fluent,
    limit: () => fluent,
    order: () => fluent,
    textSearch: () => fluent,
    maybeSingle: async () => ({ data: resolvedValue, error: errorValue }),
    single: async () => ({ data: resolvedValue, error: errorValue }),
    then: (resolve) => Promise.resolve({ data: resolvedValue, error: errorValue }).then(resolve),
  };
  return fluent;
};

const mockFetch = vi.fn();
global.fetch = mockFetch;

const PROGRAM_ID = '00000000-0000-4000-8000-000000000001';

/**
 * Fila del programa tal y como la leen las rutas. Es mutable porque el idioma de
 * contenido vive AQUÍ: las pruebas de idioma cambian `content_language` y
 * comprueban que la directiva del prompt cambia con ella. Si el valor se dejara
 * fijo, una ruta que ignorara el programa y usara el defecto ('es') pasaría las
 * aserciones igual.
 */
const buildProgramRow = () => ({
  id: PROGRAM_ID,
  org_id: 'org-222',
  title: 'Program Title',
  status: 'draft',
  welcome_message: 'welcome',
  ai_personality: 'friendly_mentor',
  content_language: 'es',
});

let mockProgramRow: Record<string, unknown> = buildProgramRow();

const buildEmployeeRow = () => ({
  id: '00000000-0000-4000-8000-000000000009',
  name: 'Candidate Hired',
  email: 'candidate@example.com',
  role_title: 'Developer',
  program_id: PROGRAM_ID,
  interview_data: { evaluation: 'Excellent interview' },
});

let mockEmployeeRow: Record<string, unknown> = buildEmployeeRow();

const mockRpc = vi.fn();
const mockFrom = vi.fn((table: string) => {
  if (table === 'users') {
    return createFluentMock({ id: 'usr-111', role: 'admin' });
  }
  if (table === 'organizations') {
    return createFluentMock({ id: 'org-222', name: 'Company Name' });
  }
  if (table === 'training_employees') {
    return createFluentMock(mockEmployeeRow);
  }
  if (table === 'training_sessions') {
    return createFluentMock({
      id: 'session-111',
      employee_id: 'emp-111',
      messages: [],
    });
  }
  if (table === 'training_programs') {
    return createFluentMock(mockProgramRow);
  }
  if (table === 'training_program_documents') {
    return createFluentMock([
      {
        training_documents: {
          id: 'doc-111',
          file_name: 'doc1.txt',
          extracted_text: 'Document content is safe and long enough to qualify as a valid training document',
          status: 'ready',
        },
      },
    ]);
  }
  if (table === 'training_document_chunks') {
    return createFluentMock([
      {
        id: 'chunk-111',
        content: 'RAG context snippet that is safe',
        document_id: 'doc-111',
      },
    ]);
  }
  return createFluentMock(null);
});

vi.mock('@/utils/supabase/admin', () => ({
  createAdminClient: () => ({
    from: mockFrom,
    rpc: mockRpc,
  }),
}));

vi.mock('@/lib/training/session', () => ({
  getTrainingEmployeeFromSession: async () => ({
    id: 'emp-111',
    name: 'Employee Name',
    org_id: 'org-222',
    program_id: PROGRAM_ID,
    role_id: 'role-333',
    role_title: 'Software Developer',
    personalization_notes: {},
  }),
}));

vi.mock('@/lib/training/auth', () => ({
  // `requireProgramAdmin` devuelve la fila completa del programa, así que
  // `generate-modules` toma el idioma de aquí y no de una consulta aparte.
  requireProgramAdmin: async () => ({
    program: mockProgramRow,
    admin: {
      from: mockFrom,
      rpc: mockRpc,
    },
    user: { id: 'usr-111' },
  }),
  requireAuthenticatedUser: async () => ({
    id: 'usr-111',
    admin: {
      from: mockFrom,
      rpc: mockRpc,
    },
  }),
}));

describe('Prompts Delimiter Validation tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OPENROUTER_API_KEY = 'mock-key';
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost';
    mockProgramRow = buildProgramRow();
    mockEmployeeRow = buildEmployeeRow();
    mockRpc.mockResolvedValue({ data: [], error: null });
  });

  it('chat endpoint prompt contains UNTRUSTED delimiters', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify({ message: 'Hello', type: 'text' }) } }],
      }),
    });

    const req = new NextRequest('http://localhost/api/training/chat', {
      method: 'POST',
      body: JSON.stringify({
        mode: 'general',
        message: 'Hi Zara',
      }),
    });

    const res = await postChat(req);
    expect(res.status).toBe(200);

    expect(mockFetch).toHaveBeenCalled();
    const fetchArgs = mockFetch.mock.calls[0];
    const fetchBody = JSON.parse(fetchArgs[1].body);
    const systemPrompt = fetchBody.messages[0].content;

    expect(systemPrompt).toContain('<UNTRUSTED_PERSON_CONTEXT>');
    expect(systemPrompt).toContain('</UNTRUSTED_PERSON_CONTEXT>');
    expect(systemPrompt).toContain('<UNTRUSTED_MODULE_CONTENT>');
    expect(systemPrompt).toContain('</UNTRUSTED_MODULE_CONTENT>');
    expect(systemPrompt).toContain('<UNTRUSTED_RAG_CONTEXT>');
    expect(systemPrompt).toContain('</UNTRUSTED_RAG_CONTEXT>');

    // El tutor responde en el idioma del programa, no en el del empleado.
    expect(systemPrompt).toContain('CONTENT LANGUAGE (MANDATORY)');
    expect(systemPrompt).toContain('Spanish (es-MX)');
  });

  it('generate-modules endpoint prompt contains UNTRUSTED delimiters', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify({ modules: [] }) } }],
      }),
    });

    const req = new NextRequest('http://localhost/api/training/generate-modules', {
      method: 'POST',
      body: JSON.stringify({
        programId: '00000000-0000-4000-8000-000000000001',
      }),
    });

    await postGenerate(req);

    expect(mockFetch).toHaveBeenCalled();
    const fetchArgs = mockFetch.mock.calls[0];
    const fetchBody = JSON.parse(fetchArgs[1].body);
    const userPrompt = fetchBody.messages[1].content;

    expect(userPrompt).toContain('<UNTRUSTED_PROGRAM_METADATA>');
    expect(userPrompt).toContain('</UNTRUSTED_PROGRAM_METADATA>');
    expect(userPrompt).toContain('<UNTRUSTED_DOCUMENT_CONTENT>');
    expect(userPrompt).toContain('</UNTRUSTED_DOCUMENT_CONTENT>');

    // La directiva de idioma va en el prompt de sistema y protege las claves y
    // los valores de enumeración que valida el esquema Zod.
    const systemPrompt = fetchBody.messages[0].content;
    expect(systemPrompt).toContain('CONTENT LANGUAGE (MANDATORY)');
    expect(systemPrompt).toContain('Spanish (es-MX)');
    expect(systemPrompt).toContain('multiple_choice');
  });

  it('hire-candidate endpoint prompt contains UNTRUSTED delimiters', async () => {
    mockRpc.mockResolvedValueOnce({
      data: '00000000-0000-4000-8000-000000000009',
      error: null,
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify({ strengths: [], areasToWatch: [], learningStyle: 'Read', customTips: [] }) } }],
      }),
    });

    const req = new NextRequest('http://localhost/api/training/hire-candidate', {
      method: 'POST',
      body: JSON.stringify({
        candidateResultId: '00000000-0000-4000-8000-000000000008',
        programId: '00000000-0000-4000-8000-000000000001',
      }),
    });

    const res = await postHire(req);
    expect(res.status).toBe(200);

    expect(mockFetch).toHaveBeenCalled();
    const fetchArgs = mockFetch.mock.calls[0];
    const fetchBody = JSON.parse(fetchArgs[1].body);
    const userPrompt = fetchBody.messages[1].content;

    expect(userPrompt).toContain('<UNTRUSTED_EMPLOYEE_CONTEXT>');
    expect(userPrompt).toContain('</UNTRUSTED_EMPLOYEE_CONTEXT>');

    // Las notas de personalización alimentan el prompt del tutor: tienen que
    // salir en el idioma del programa.
    const systemPrompt = fetchBody.messages[0].content;
    expect(systemPrompt).toContain('CONTENT LANGUAGE (MANDATORY)');
    expect(systemPrompt).toContain('Spanish (es-MX)');
  });
});

/**
 * Propagación del idioma de contenido del PROGRAMA a los prompts.
 *
 * Todas estas pruebas usan `content_language: 'en'` a propósito: el defecto del
 * producto es 'es', así que una ruta que ignorara el programa y cayera al
 * defecto pasaría cualquier aserción sobre español. Con 'en' la aserción solo
 * puede pasar si el idioma viene de la fila del programa.
 *
 * Cada ruta comprueba además un marcador del `scope` que le corresponde, porque
 * una directiva con el scope equivocado enumera campos que ese consumidor no
 * produce.
 */
describe('Program content language propagation to AI prompts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OPENROUTER_API_KEY = 'mock-key';
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost';
    mockProgramRow = { ...buildProgramRow(), content_language: 'en' };
    mockEmployeeRow = buildEmployeeRow();
    mockRpc.mockResolvedValue({ data: [], error: null });
  });

  it('chat injects the program language with the conversation scope', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify({ message: 'Hello', type: 'text' }) } }],
      }),
    });

    const req = new NextRequest('http://localhost/api/training/chat', {
      method: 'POST',
      body: JSON.stringify({ mode: 'general', message: 'Hi Zara' }),
    });

    const res = await postChat(req);
    expect(res.status).toBe(200);

    const systemPrompt = JSON.parse(mockFetch.mock.calls[0][1].body).messages[0].content;

    expect(systemPrompt).toContain('English (en-US)');
    expect(systemPrompt).not.toContain('Spanish (es-MX)');
    // Scope `conversation`: protege las claves de la respuesta del tutor y no
    // menciona la superficie de los módulos generados.
    expect(systemPrompt).toContain('every message addressed to the employee');
    expect(systemPrompt).toContain('"contentCovered"');
    expect(systemPrompt).not.toContain('section bodies');
  });

  it('generate-modules injects the program language with the module content scope', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify({ modules: [] }) } }],
      }),
    });

    const req = new NextRequest('http://localhost/api/training/generate-modules', {
      method: 'POST',
      body: JSON.stringify({ programId: PROGRAM_ID }),
    });

    await postGenerate(req);

    const systemPrompt = JSON.parse(mockFetch.mock.calls[0][1].body).messages[0].content;

    expect(systemPrompt).toContain('English (en-US)');
    expect(systemPrompt).not.toContain('Spanish (es-MX)');
    // Scope `module_content` y literales del esquema Zod que no se traducen.
    expect(systemPrompt).toContain('section bodies');
    expect(systemPrompt).toContain('multiple_choice');
    expect(systemPrompt).toContain('open_ended');
    expect(systemPrompt).toContain('true_false');
  });

  it('hire-candidate injects the program language with the personalization scope', async () => {
    mockRpc.mockResolvedValueOnce({
      data: '00000000-0000-4000-8000-000000000009',
      error: null,
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                strengths: [],
                areasToWatch: [],
                learningStyle: 'Read',
                customTips: [],
              }),
            },
          },
        ],
      }),
    });

    const req = new NextRequest('http://localhost/api/training/hire-candidate', {
      method: 'POST',
      body: JSON.stringify({
        candidateResultId: '00000000-0000-4000-8000-000000000008',
        programId: PROGRAM_ID,
      }),
    });

    const res = await postHire(req);
    expect(res.status).toBe(200);

    const systemPrompt = JSON.parse(mockFetch.mock.calls[0][1].body).messages[0].content;

    expect(systemPrompt).toContain('English (en-US)');
    expect(systemPrompt).not.toContain('Spanish (es-MX)');
    expect(systemPrompt).toContain('the learning style sentence');
    expect(systemPrompt).toContain('"customTips"');
  });
});

/**
 * Correo de bienvenida de `hire-candidate`.
 *
 * Estaba hardcodeado en inglés; ahora sigue el idioma del programa. Se comprueba
 * en los dos idiomas (una sola plantilla HTML, textos por idioma) y que el
 * escapado de los datos del empleado sigue aplicándose.
 */
describe('Hire candidate welcome email language', () => {
  const brevoCall = () =>
    mockFetch.mock.calls.find((call) =>
      String(call[0]).includes('api.brevo.com')
    );

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OPENROUTER_API_KEY = 'mock-key';
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost';
    process.env.BREVO_API_KEY = 'mock-brevo-key';
    mockProgramRow = buildProgramRow();
    mockEmployeeRow = buildEmployeeRow();
    mockRpc.mockResolvedValue({ data: [], error: null });
  });

  afterEach(() => {
    delete process.env.BREVO_API_KEY;
  });

  const hire = async () => {
    mockRpc.mockResolvedValueOnce({
      data: '00000000-0000-4000-8000-000000000009',
      error: null,
    });

    // 1ª llamada: personalización con IA. 2ª: entrega del correo en Brevo.
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                strengths: [],
                areasToWatch: [],
                learningStyle: 'Read',
                customTips: [],
              }),
            },
          },
        ],
      }),
    });
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });

    const req = new NextRequest('http://localhost/api/training/hire-candidate', {
      method: 'POST',
      body: JSON.stringify({
        candidateResultId: '00000000-0000-4000-8000-000000000008',
        programId: PROGRAM_ID,
      }),
    });

    return postHire(req);
  };

  it('sends the welcome email in Spanish when the program language is es', async () => {
    const res = await hire();
    expect(res.status).toBe(200);

    const call = brevoCall();
    expect(call).toBeDefined();
    const payload = JSON.parse(call![1].body);

    expect(payload.subject).toContain('Bienvenido a tu capacitación');
    expect(payload.htmlContent).toContain('Comenzar mi capacitación');
    expect(payload.htmlContent).toContain('lang="es"');
    expect(payload.htmlContent).not.toContain('Start My Training');
  });

  it('sends the welcome email in English when the program language is en', async () => {
    mockProgramRow = { ...buildProgramRow(), content_language: 'en' };

    const res = await hire();
    expect(res.status).toBe(200);

    const payload = JSON.parse(brevoCall()![1].body);

    expect(payload.subject).toContain('Welcome to Your Training');
    expect(payload.htmlContent).toContain('Start My Training');
    expect(payload.htmlContent).toContain('lang="en"');
    expect(payload.htmlContent).not.toContain('Comenzar mi capacitación');
  });

  it('escapes employee data in the welcome email in every language', async () => {
    mockEmployeeRow = {
      ...buildEmployeeRow(),
      name: '<script>alert(1)</script>',
      role_title: 'Dev "&" Ops',
    };

    await hire();

    const payload = JSON.parse(brevoCall()![1].body);

    expect(payload.htmlContent).toContain('&lt;script&gt;');
    expect(payload.htmlContent).not.toContain('<script>');
    expect(payload.htmlContent).toContain('Dev &quot;&amp;&quot; Ops');
  });
});
