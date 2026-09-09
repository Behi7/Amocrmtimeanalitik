import { AppError } from './errors';

let accessToken: string | null = null;
export const setAccessToken = (t: string | null) => { accessToken = t; };
export const getAccessToken = () => accessToken;

let refreshPromise: Promise<string> | null = null;

async function refreshSession(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    try {
      const r = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' });
      if (!r.ok) return null;
      const data = await r.json();
      setAccessToken(data.accessToken);
      return data.accessToken;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

export async function api<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(init.headers as any) };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  let resp = await fetch(`/api${path}`, { ...init, headers, credentials: 'include' });
  if (resp.status === 401 && !path.includes('/auth/')) {
    const newToken = await refreshSession();
    if (newToken) {
      headers.Authorization = `Bearer ${newToken}`;
      resp = await fetch(`/api${path}`, { ...init, headers, credentials: 'include' });
    } else {
      window.location.href = '/login';
      throw new AppError('UNAUTHORIZED', 'Session expired');
    }
  }
  if (!resp.ok) {
    let errData: any;
    try { errData = await resp.json(); } catch { errData = { error: { code: 'UNKNOWN', message: resp.statusText } }; }
    throw new AppError(errData?.error?.code || 'UNKNOWN', errData?.error?.message || 'Request failed');
  }
  if (resp.status === 204) return null as any;
  return resp.json();
}

export const authApi = {
  login: (email: string, password: string) =>
    api<{ accessToken: string; role: string }>('/auth/login', {
      method: 'POST', body: JSON.stringify({ email, password }),
    }),
  logout: () => api<void>('/auth/logout', { method: 'POST' }),
  refresh: () => refreshSession(),
};

export const adminApi = {
  listAccounts: () => api<any[]>('/admin/accounts'),
  createAccount: (data: any) => api('/admin/accounts', { method: 'POST', body: JSON.stringify(data) }),
  patchAccount: (id: number, data: any) => api(`/admin/accounts/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteAccount: (id: number) => api(`/admin/accounts/${id}`, { method: 'DELETE' }),
  retryBackfill: (id: number) => api(`/admin/accounts/${id}/retry-backfill`, { method: 'POST' }),
  listNotifications: (unreadOnly = false) => api<any[]>(`/admin/notifications?unreadOnly=${unreadOnly}`),
  readNotification: (id: number) => api(`/admin/notifications/${id}/read`, { method: 'POST' }),
};

export const userApi = {
  pipelines: (accountId: number) => api<{ items: any[]; dataFreshness: any }>(`/accounts/${accountId}/pipelines`),
  tags: (accountId: number) => api<{ items: any[]; dataFreshness: any }>(`/accounts/${accountId}/tags`),
  stagesStats: (pipelineId: number, tagIds: number[] = []) =>
    api<{ items: any[]; dataFreshness: any }>(`/pipelines/${pipelineId}/stages-stats${tagIds.length ? `?tagIds=${tagIds.join(',')}` : ''}`),
  activeLeads: (stageId: number, page = 1, perPage = 50, tagIds: number[] = []) =>
    api(`/stages/${stageId}/active-leads?page=${page}&perPage=${perPage}${tagIds.length ? `&tagIds=${tagIds.join(',')}` : ''}`),
  leadHistory: (leadId: number) => api(`/leads/${leadId}/history`),
  searchLeads: (accountId: number, q: string, page = 1, perPage = 50, tagIds: number[] = []) =>
    api(`/accounts/${accountId}/leads/search?q=${encodeURIComponent(q)}&page=${page}&perPage=${perPage}${tagIds.length ? `&tagIds=${tagIds.join(',')}` : ''}`),
  leadsByStatus: (accountId: number, status: string, page = 1, perPage = 50, tagIds: number[] = []) =>
    api(`/accounts/${accountId}/leads?status=${status}&page=${page}&perPage=${perPage}${tagIds.length ? `&tagIds=${tagIds.join(',')}` : ''}`),
};
