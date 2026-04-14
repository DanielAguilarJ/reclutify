import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Role, CandidateResult } from '@/types';

interface AdminState {
  roles: Role[];
  candidates: CandidateResult[];

  addRole: (role: Role) => void;
  updateRole: (id: string, updates: Partial<Role>) => void;
  removeRole: (id: string) => void;
  addCandidate: (candidate: CandidateResult) => void;
  updateCandidate: (id: string, updates: Partial<CandidateResult>) => void;
}

// No hardcoded roles — companies create their own via the AI-powered role builder
const sampleRoles: Role[] = [];

const sampleCandidates: CandidateResult[] = [];

export const useAdminStore = create<AdminState>()(
  persist(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (set: any) => ({
      roles: sampleRoles,
      candidates: sampleCandidates,

      addRole: (role: Role) =>
        set((state: AdminState) => ({
          roles: [role, ...state.roles],
        })),

      updateRole: (id: string, updates: Partial<Role>) =>
        set((state: AdminState) => ({
          roles: state.roles.map((r) =>
            r.id === id ? { ...r, ...updates } : r
          ),
        })),

      removeRole: (id: string) =>
        set((state: AdminState) => ({
          roles: state.roles.filter((r) => r.id !== id),
        })),

      addCandidate: (candidate: CandidateResult) =>
        set((state: AdminState) => ({
          candidates: [candidate, ...state.candidates], // Latest at top
        })),

      updateCandidate: (id: string, updates: Partial<CandidateResult>) =>
        set((state: AdminState) => ({
          candidates: state.candidates.map((c) =>
            c.id === id ? { ...c, ...updates } : c
          ),
        })),
    }),
    {
      name: 'worldbrain-admin-storage',
    }
  )
);
