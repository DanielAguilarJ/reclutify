import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';

/**
 * Pruebas de la pantalla `/interview/t/[token]`.
 *
 * Lo que se fija aquí es el cambio de fuente de verdad: la pantalla ya no
 * resuelve el ticket con la clave anon desde el navegador, sino que pregunta a
 * `POST /api/interview/ticket`. Y, sobre todo, que ya no existe la puerta de
 * atrás del parámetro `?d=`.
 *
 * QUÉ ERA `?d=`. La pantalla decodificaba un payload base64 del parámetro `d` de
 * la URL e inyectaba en los stores el ticket Y el puesto completo, con sus
 * criterios de evaluación. Cualquiera podía fabricar ese parámetro: se abría una
 * entrevista funcional sin ticket real, con los temas que quisiera el autor del
 * enlace, y consumiendo crédito de IA en cada turno. Era un puente que anulaba
 * cualquier control del servidor, así que la prueba de abajo comprueba que un
 * `?d=` bien formado y con datos válidos ya no abre nada.
 *
 * Los componentes del flujo se sustituyen por marcadores: lo que se verifica es
 * la máquina de estados de la pantalla, no la sala de entrevista.
 */

const { TOKEN } = vi.hoisted(() => ({ TOKEN: 'TOKENVALIDO123456' }));

/**
 * `use(params)` suspende con una promesa nativa y en un render de prueba no hay
 * quien reintente, así que se resuelve el segmento dinámico directamente. Es el
 * mismo enfoque que usa la suite de la pantalla de capacitación.
 */
vi.mock('react', async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  return { ...original, use: () => ({ token: TOKEN }) };
});

vi.mock('@/components/candidate/DetailsForm', () => ({
  default: () => <div data-testid="details-form" />,
}));
vi.mock('@/components/candidate/InterviewOverview', () => ({
  default: () => <div data-testid="interview-overview" />,
}));
vi.mock('@/components/candidate/HardwareCheck', () => ({
  default: () => <div data-testid="hardware-check" />,
}));
vi.mock('@/components/candidate/QuickDeviceSetup', () => ({
  default: () => <div data-testid="quick-device-setup" />,
}));
vi.mock('@/components/candidate/InterviewRoom', () => ({
  default: () => <div data-testid="interview-room" />,
}));
vi.mock('@/components/candidate/InterviewComplete', () => ({
  default: () => <div data-testid="interview-complete" />,
}));

// El logo es el único punto donde se observa la marca blanca por plan.
vi.mock('@/components/ui/Logo', () => ({
  default: ({ forceWhiteLabel }: { forceWhiteLabel?: boolean }) => (
    <div data-testid="logo" data-white-label={String(Boolean(forceWhiteLabel))} />
  ),
}));

import TicketInterviewPage from '@/app/interview/t/[token]/page';
import { useAppStore } from '@/store/appStore';
import { useInterviewStore } from '@/store/interviewStore';
import {
  INTERVIEW_TICKET_CONSUME_PATH,
  INTERVIEW_TICKET_RESOLVE_PATH,
} from '@/lib/interview-tickets/client';

const VALID_TOPIC = {
  id: 'topic-1',
  label: 'Diseño de sistemas',
  rubric: { excellent: 'ok', acceptable: 'regular', poor: 'mal', weight: 8 },
};

const VALID_RESPONSE = {
  status: 'valid',
  ticket: {
    candidateName: 'Fictional Candidate',
    roleId: 'role-backend',
    language: 'en',
    expiresAt: Date.now() + 60 * 60 * 1000,
    used: false,
  },
  role: {
    id: 'role-backend',
    title: 'Backend',
    interviewDuration: 45,
    interviewMode: 'restricted',
    topics: [VALID_TOPIC],
  },
  org: { planTier: 'enterprise' },
};

/**
 * Payload `?d=` fabricado a mano, con la forma exacta que la pantalla aceptaba:
 * un ticket vigente y sin usar, y un puesto con sus propios criterios.
 */
function forgedDParam(): string {
  const payload = {
    t: {
      id: 'ticket-fabricado',
      token: TOKEN,
      candidateName: 'Intruso',
      roleId: 'role-fabricado',
      language: 'es',
      createdAt: Date.now(),
      expiresAt: Date.now() + 60 * 60 * 1000,
      used: false,
    },
    r: {
      id: 'role-fabricado',
      title: 'Puesto Fabricado',
      topics: [{ id: 'topic-fabricado', label: 'Tema elegido por el atacante' }],
      createdAt: Date.now(),
      interviewDuration: 90,
      interviewMode: 'internal',
    },
  };

  return btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();

async function renderPage() {
  render(<TicketInterviewPage params={Promise.resolve({ token: TOKEN })} />);

  // Deja correr la petición de resolución del ticket.
  await act(async () => {
    await Promise.resolve();
  });
}

/** Cuerpos enviados a una ruta, ya deserializados. */
function bodiesSentTo(path: string): unknown[] {
  return fetchMock.mock.calls
    .filter(([input]) => input === path)
    .map(([, init]) => JSON.parse(String(init?.body)));
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  useInterviewStore.getState().reset();
  useAppStore.getState().setLanguage('es');
  window.history.replaceState({}, '', `/interview/t/${TOKEN}`);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('/interview/t/[token] — el respaldo por URL ?d= ya no existe', () => {
  it('no abre la entrevista con un ?d= fabricado cuando el servidor no reconoce el token', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ status: 'not_found' }, 404));
    window.history.replaceState({}, '', `/interview/t/${TOKEN}?d=${forgedDParam()}`);

    await renderPage();

    await waitFor(() => {
      expect(screen.getByText('Ticket Inválido')).toBeInTheDocument();
    });

    // Ni sala de entrevista ni formulario: la pantalla se queda en el rechazo.
    expect(screen.queryByTestId('interview-room')).not.toBeInTheDocument();
    expect(screen.queryByTestId('details-form')).not.toBeInTheDocument();

    // Y nada del payload llegó a los stores: ni los criterios elegidos por quien
    // fabricó el enlace, ni la duración, ni el modo de entrevista.
    const interview = useInterviewStore.getState();
    expect(interview.topics).toEqual([]);
    expect(interview.roleId).toBeNull();
    expect(interview.interviewDuration).toBe(30);
    expect(interview.interviewMode).toBe('restricted');
  });

  it('el estado del ticket lo decide el servidor, no la URL', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ status: 'used' }, 409));
    window.history.replaceState({}, '', `/interview/t/${TOKEN}?d=${forgedDParam()}`);

    await renderPage();

    await waitFor(() => {
      expect(screen.getByText('Ticket Ya Utilizado')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('details-form')).not.toBeInTheDocument();
  });

  it('manda el token en el cuerpo, nunca en la URL de la petición', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ status: 'not_found' }, 404));

    await renderPage();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    for (const [input] of fetchMock.mock.calls) {
      expect(String(input)).not.toContain(TOKEN);
    }
    expect(bodiesSentTo(INTERVIEW_TICKET_RESOLVE_PATH)).toEqual([{ token: TOKEN }]);
  });
});

describe('/interview/t/[token] — token válido', () => {
  beforeEach(() => {
    fetchMock.mockImplementation(async (input) =>
      input === INTERVIEW_TICKET_CONSUME_PATH
        ? jsonResponse({ status: 'consumed' })
        : jsonResponse(VALID_RESPONSE),
    );
  });

  it('arranca en el formulario con el idioma, el nombre y el puesto del ticket', async () => {
    await renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('details-form')).toBeInTheDocument();
    });

    expect(useAppStore.getState().language).toBe('en');

    const interview = useInterviewStore.getState();
    expect(interview.candidate.name).toBe('Fictional Candidate');
    expect(interview.topics).toEqual([VALID_TOPIC]);
    expect(interview.roleId).toBe('role-backend');
    expect(interview.interviewDuration).toBe(45);
    expect(interview.interviewMode).toBe('restricted');
  });

  it('activa la marca blanca cuando el plan de la organización es enterprise', async () => {
    await renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('logo')).toHaveAttribute('data-white-label', 'true');
    });
  });

  it('consume el ticket solo al entrar a la sala, no al validar el enlace', async () => {
    await renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('details-form')).toBeInTheDocument();
    });

    // Validar el enlace no quema el ticket: quien cierra el navegador en el
    // formulario puede volver a abrirlo.
    expect(bodiesSentTo(INTERVIEW_TICKET_CONSUME_PATH)).toEqual([]);

    await act(async () => {
      useInterviewStore.getState().setPhase('interview');
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.getByTestId('interview-room')).toBeInTheDocument();
    });
    expect(bodiesSentTo(INTERVIEW_TICKET_CONSUME_PATH)).toEqual([{ token: TOKEN }]);
  });
});
