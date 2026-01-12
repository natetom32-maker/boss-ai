import { create } from 'zustand';
import api from '../services/api';

interface MemoryItem {
  memory_id: string;
  user_id: string;
  scope: 'L0_PRIME' | 'L1_WORKSPACE' | 'L2_PROJECT' | 'L3_SESSION';
  project_id?: string;
  key: string;
  value: any;
  version: number;
  last_event_id: string;
  created_at: string;
  updated_at: string;
}

interface MemoryEvent {
  event_id: string;
  user_id: string;
  event_type: string;
  scope: string;
  project_id?: string;
  key: string;
  value: any;
  metadata: Record<string, any>;
  timestamp: string;
}

interface Decision {
  decision_id: string;
  user_id: string;
  project_id?: string;
  title: string;
  description: string;
  context: Record<string, any>;
  outcome?: string;
  memory_keys_used: string[];
  created_at: string;
}

interface Checkpoint {
  checkpoint_id: string;
  user_id: string;
  checkpoint_type: string;
  action_description: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  context: Record<string, any>;
  created_at: string;
  resolved_at?: string;
}

interface Project {
  project_id: string;
  user_id: string;
  name: string;
  description?: string;
  created_at: string;
}

interface BossResponse {
  response: string;
  memory_used: Array<{ key: string; scope: string }>;
  decisions_made: string[];
  checkpoint_required?: {
    checkpoint_id: string;
    type: string;
    reason: string;
  };
  model_used: string;
}

interface MemoryReceipt {
  scope: string;
  items_count: number;
  items_used: Array<{ key: string; value: string }>;
  why_used: string;
}

interface BossStore {
  // State
  memory: MemoryItem[];
  events: MemoryEvent[];
  decisions: Decision[];
  checkpoints: Checkpoint[];
  projects: Project[];
  currentProject: Project | null;
  memoryReceipt: MemoryReceipt[];
  isLoading: boolean;
  error: string | null;
  lastBossResponse: BossResponse | null;
  
  // Actions
  fetchMemory: (scope?: string, projectId?: string) => Promise<void>;
  fetchEvents: (limit?: number) => Promise<void>;
  fetchDecisions: (projectId?: string) => Promise<void>;
  fetchCheckpoints: (status?: string) => Promise<void>;
  fetchProjects: () => Promise<void>;
  fetchMemoryReceipt: (projectId?: string) => Promise<void>;
  
  setMemory: (key: string, value: any, scope: string, projectId?: string) => Promise<void>;
  deleteMemory: (key: string, scope: string, projectId?: string) => Promise<void>;
  
  createProject: (name: string, description?: string) => Promise<Project>;
  setCurrentProject: (project: Project | null) => void;
  
  sendMessage: (message: string, projectId?: string) => Promise<BossResponse>;
  resolveCheckpoint: (checkpointId: string, status: 'APPROVED' | 'REJECTED') => Promise<void>;
  
  clearError: () => void;
}

export const useBossStore = create<BossStore>((set, get) => ({
  memory: [],
  events: [],
  decisions: [],
  checkpoints: [],
  projects: [],
  currentProject: null,
  memoryReceipt: [],
  isLoading: false,
  error: null,
  lastBossResponse: null,

  fetchMemory: async (scope?: string, projectId?: string) => {
    try {
      set({ isLoading: true, error: null });
      const params = new URLSearchParams();
      if (scope) params.append('scope', scope);
      if (projectId) params.append('project_id', projectId);
      
      const response = await api.get(`/memory/state?${params}`);
      set({ memory: response.data, isLoading: false });
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
    }
  },

  fetchEvents: async (limit = 50) => {
    try {
      set({ isLoading: true, error: null });
      const response = await api.get(`/memory/events?limit=${limit}`);
      set({ events: response.data, isLoading: false });
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
    }
  },

  fetchDecisions: async (projectId?: string) => {
    try {
      set({ isLoading: true, error: null });
      const params = projectId ? `?project_id=${projectId}` : '';
      const response = await api.get(`/decisions${params}`);
      set({ decisions: response.data, isLoading: false });
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
    }
  },

  fetchCheckpoints: async (status?: string) => {
    try {
      set({ isLoading: true, error: null });
      const params = status ? `?status=${status}` : '';
      const response = await api.get(`/checkpoints${params}`);
      set({ checkpoints: response.data, isLoading: false });
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
    }
  },

  fetchProjects: async () => {
    try {
      set({ isLoading: true, error: null });
      const response = await api.get('/projects');
      set({ projects: response.data, isLoading: false });
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
    }
  },

  fetchMemoryReceipt: async (projectId?: string) => {
    try {
      const params = projectId ? `?project_id=${projectId}` : '';
      const response = await api.get(`/boss/memory-receipt${params}`);
      set({ memoryReceipt: response.data });
    } catch (error: any) {
      console.error('Failed to fetch memory receipt:', error);
    }
  },

  setMemory: async (key: string, value: any, scope: string, projectId?: string) => {
    try {
      set({ isLoading: true, error: null });
      await api.post('/memory/events', {
        event_type: 'MEMORY_SET',
        scope,
        key,
        value,
        project_id: projectId,
        metadata: {}
      });
      await get().fetchMemory(scope, projectId);
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
    }
  },

  deleteMemory: async (key: string, scope: string, projectId?: string) => {
    try {
      set({ isLoading: true, error: null });
      const params = new URLSearchParams();
      params.append('scope', scope);
      if (projectId) params.append('project_id', projectId);
      
      await api.delete(`/memory/${key}?${params}`);
      await get().fetchMemory(scope, projectId);
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
    }
  },

  createProject: async (name: string, description?: string) => {
    try {
      set({ isLoading: true, error: null });
      const response = await api.post('/projects', { name, description });
      await get().fetchProjects();
      set({ isLoading: false });
      return response.data;
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
      throw error;
    }
  },

  setCurrentProject: (project: Project | null) => {
    set({ currentProject: project });
  },

  sendMessage: async (message: string, projectId?: string) => {
    try {
      set({ isLoading: true, error: null });
      const response = await api.post('/boss/message', {
        message,
        project_id: projectId,
        include_memory: true
      });
      set({ lastBossResponse: response.data, isLoading: false });
      return response.data;
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
      throw error;
    }
  },

  resolveCheckpoint: async (checkpointId: string, status: 'APPROVED' | 'REJECTED') => {
    try {
      set({ isLoading: true, error: null });
      await api.put(`/checkpoints/${checkpointId}`, { status });
      await get().fetchCheckpoints();
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
    }
  },

  clearError: () => set({ error: null }),
}));
