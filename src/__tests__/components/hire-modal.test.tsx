import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import HireModal from '@/components/admin/HireModal';
import type { CandidateResult, TrainingModule, TrainingProgram } from '@/types';

const { mockUseTrainingAdminStore } = vi.hoisted(() => ({
  mockUseTrainingAdminStore: vi.fn(),
}));

vi.mock('@/store/trainingAdminStore', () => ({
  useTrainingAdminStore: mockUseTrainingAdminStore,
}));

const candidate = {
  id: 'cand-1',
  roleId: 'role-1',
  roleTitle: 'Backend Dev',
  date: new Date().toISOString(),
  status: 'completed',
  transcript: [],
  candidate: { name: 'Ana Perez', email: 'ana@example.com', phone: '555' },
  evaluation: { recommendation: 'Pass' },
} as unknown as CandidateResult;

function program(overrides: Partial<TrainingProgram>): TrainingProgram {
  return {
    id: 'prog-1',
    orgId: 'org-1',
    roleId: 'role-1',
    title: 'Onboarding Backend',
    isDefault: false,
    aiPersonality: 'friendly_mentor',
    status: 'published',
    version: 1,
    passingScore: 70,
    createdAt: '',
    updatedAt: '',
    ...overrides,
  } as TrainingProgram;
}

const moduleFor = (programId: string): TrainingModule =>
  ({ id: `mod-${programId}`, programId, title: 'M1', content: { sections: [] } } as unknown as TrainingModule);

function setStore(programs: TrainingProgram[], modules: TrainingModule[]) {
  mockUseTrainingAdminStore.mockReturnValue({
    programs,
    modules,
    fetchTrainingData: vi.fn(),
  });
}

describe('HireModal program eligibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('offers published programs of the role that have modules', () => {
    setStore([program({})], [moduleFor('prog-1')]);
    render(<HireModal candidate={candidate} language="es" onClose={() => {}} />);

    expect(screen.getByRole('option', { name: 'Onboarding Backend' })).toBeDefined();
  });

  it('shows an actionable empty state when the published program has no modules', () => {
    setStore([program({})], []);
    render(<HireModal candidate={candidate} language="es" onClose={() => {}} />);

    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.getByText(/No hay programas de capacitación publicados/i)).toBeDefined();
  });

  it('excludes draft programs and programs of other roles', () => {
    setStore(
      [
        program({ id: 'prog-draft', title: 'Draft Program', status: 'draft' }),
        program({ id: 'prog-other', title: 'Other Role Program', roleId: 'role-2' }),
      ],
      [moduleFor('prog-draft'), moduleFor('prog-other')]
    );
    render(<HireModal candidate={candidate} language="en" onClose={() => {}} />);

    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.getByText(/no published training programs/i)).toBeDefined();
  });

  it('disables the confirm button when no program is eligible', () => {
    setStore([], []);
    render(<HireModal candidate={candidate} language="es" onClose={() => {}} />);

    const confirm = screen.getByRole('button', { name: 'Contratar' });
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
  });
});
