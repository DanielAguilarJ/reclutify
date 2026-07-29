import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import React from 'react';
import TrainingCenterPage from '../../app/training/center/page';
import type { TrainingContentLanguage } from '../../lib/training/content-language';

const { mockUseTrainingStore, mockGetState } = vi.hoisted(() => {
  const mockHook = vi.fn();
  const mockGet = vi.fn();
  (mockHook as unknown as { getState: typeof mockGet }).getState = mockGet;
  return { mockUseTrainingStore: mockHook, mockGetState: mockGet };
});

const mockPush = vi.fn();
const mockReplace = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
}));

// Igual que en la vista de módulo: el idioma sale del programa, no de la
// preferencia de la aplicación.
let mockContentLanguage: TrainingContentLanguage = 'es';

vi.mock('@/store/trainingStore', () => ({
  useTrainingStore: mockUseTrainingStore,
  useTrainingContentLanguage: () => mockContentLanguage,
}));

interface ModuleSeed {
  id: string;
  title: string;
  sortOrder: number;
}

function makeModule({ id, title, sortOrder }: ModuleSeed) {
  return {
    id,
    programId: 'prog-1',
    title,
    description: `Descripción de ${title}`,
    content: { sections: [{ title: 'Sección', body: 'Cuerpo', keyPoints: [] }] },
    sourceDocumentIds: [],
    sortOrder,
    durationEstimate: 20,
    evaluationEnabled: true,
    evaluationQuestions: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

const modules = [
  makeModule({ id: 'mod-1', title: 'Bienvenida y cultura', sortOrder: 1 }),
  makeModule({ id: 'mod-2', title: 'Seguridad operativa', sortOrder: 2 }),
  makeModule({ id: 'mod-3', title: 'Cierre del programa', sortOrder: 3 }),
];

function makeProgress(moduleId: string, status: string, timeSpent = 0) {
  return {
    id: `pr-${moduleId}`,
    employeeId: 'emp-1',
    moduleId,
    status,
    timeSpent,
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

const startModule = vi.fn().mockResolvedValue(undefined);
const initializeFromSession = vi.fn().mockResolvedValue(true);
const startGeneralChat = vi.fn().mockResolvedValue(undefined);
const sendGeneralMessage = vi.fn().mockResolvedValue(undefined);

function makeStore(overrides: Record<string, unknown> = {}) {
  return {
    employee: {
      id: 'emp-1',
      orgId: 'org-1',
      programId: 'prog-1',
      name: 'Ana López',
      email: 'ana@example.com',
      roleTitle: 'Operaciones',
      status: 'in_progress',
      overallProgress: 33,
    },
    program: { id: 'prog-1', title: 'Onboarding Operaciones' },
    modules,
    progress: [
      makeProgress('mod-1', 'completed', 20),
      makeProgress('mod-2', 'in_progress', 5),
      makeProgress('mod-3', 'locked'),
    ],
    phase: 'overview',
    loading: false,
    startModule,
    initializeFromSession,
    generalMessages: [],
    startGeneralChat,
    sendGeneralMessage,
    aiSpeaking: false,
    ...overrides,
  };
}

function renderPage(store: Record<string, unknown>) {
  mockUseTrainingStore.mockReturnValue(store);
  mockGetState.mockReturnValue(store);

  return render(<TrainingCenterPage />);
}

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe('TrainingCenterPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockContentLanguage = 'es';
  });

  it('points the continuation block at the module in progress', async () => {
    renderPage(makeStore());
    await flush();

    expect(screen.getByText('Continúa donde lo dejaste')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Seguridad operativa' })
    ).toBeInTheDocument();

    const primary = screen.getByRole('button', { name: /Continuar módulo/ });

    await act(async () => {
      primary.click();
    });

    expect(startModule).toHaveBeenCalledWith('mod-2');
    expect(mockPush).toHaveBeenCalledWith('/training/center/module/mod-2');
  });

  it('invites to start the first module when nothing began', async () => {
    renderPage(
      makeStore({
        progress: [
          makeProgress('mod-1', 'available'),
          makeProgress('mod-2', 'locked'),
          makeProgress('mod-3', 'locked'),
        ],
      })
    );
    await flush();

    expect(screen.getByText('Empieza por aquí')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Bienvenida y cultura' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Comenzar módulo/ })
    ).toBeInTheDocument();
  });

  it('shows the closing block instead of an action when the program is complete', async () => {
    renderPage(
      makeStore({
        phase: 'complete',
        employee: {
          id: 'emp-1',
          orgId: 'org-1',
          programId: 'prog-1',
          name: 'Ana López',
          email: 'ana@example.com',
          status: 'completed',
          overallProgress: 100,
          overallScore: 92,
          completedAt: '2026-02-10T00:00:00.000Z',
        },
        progress: modules.map((module) =>
          makeProgress(module.id, 'completed', 10)
        ),
      })
    );
    await flush();

    expect(
      screen.getByRole('heading', { name: 'Capacitación completada' })
    ).toBeInTheDocument();
    expect(screen.getByText('Certificado de completación')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Continuar módulo|Comenzar módulo/ })
    ).not.toBeInTheDocument();
  });

  it('renders the screen in the content language of the program', async () => {
    mockContentLanguage = 'en';

    renderPage(makeStore());
    await flush();

    expect(screen.getByText('Pick up where you left off')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Continue module/ })
    ).toBeInTheDocument();
    expect(screen.getByText('Training center')).toBeInTheDocument();
    expect(
      screen.queryByText('Continúa donde lo dejaste')
    ).not.toBeInTheDocument();
  });

  it('exposes the outline as a navigation and keeps locked modules unclickable', async () => {
    renderPage(makeStore());
    await flush();

    const outline = screen.getByRole('navigation', {
      name: 'Módulos del programa',
    });

    expect(outline).toBeInTheDocument();

    const lockedRow = screen.getByText('Cierre del programa');

    expect(lockedRow.closest('button')).toBeNull();
    expect(
      screen.getByRole('button', { name: /Bienvenida y cultura/ })
    ).toBeInTheDocument();
  });

  it('opens a completed module for review without restarting it', async () => {
    renderPage(makeStore());
    await flush();

    const completedRow = screen.getByRole('button', {
      name: /Bienvenida y cultura/,
    });

    await act(async () => {
      completedRow.click();
    });

    expect(startModule).not.toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith('/training/center/module/mod-1');
  });

  it('keeps the tutor docked and collapsed until it is opened', async () => {
    renderPage(makeStore());
    await flush();

    const toggle = screen.getByRole('button', { name: /Tutor IA/ });

    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(startGeneralChat).not.toHaveBeenCalled();

    await act(async () => {
      toggle.click();
    });

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(startGeneralChat).toHaveBeenCalledTimes(1);
  });

  it('redirects to / when the session cannot be recovered', async () => {
    renderPage(
      makeStore({
        employee: null,
        initializeFromSession: vi.fn().mockResolvedValue(false),
      })
    );
    await flush();

    expect(mockReplace).toHaveBeenCalledWith('/');
  });
});
