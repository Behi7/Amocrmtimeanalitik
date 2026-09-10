import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { userApi } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { formatDistanceToNow } from 'date-fns';
import { ru } from 'date-fns/locale';

function formatDuration(seconds: number): string {
  if (!seconds) return '0 сек';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}д`);
  if (h > 0) parts.push(`${h}ч`);
  if (m > 0) parts.push(`${m}м`);
  return parts.join(' ') || '<1м';
}

export default function StatsPage() {
  const { accountId: paramAccountId } = useParams();
  const { role } = useAuth();
  const nav = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // For viewer, get their accountId from JWT (we'll fetch pipelines for a dummy and extract)
  const [accountId, setAccountId] = useState<number | null>(
    paramAccountId ? parseInt(paramAccountId, 10) : null,
  );
  const storedPipelineId = Number(searchParams.get('pipeline'));
  const storedTagIds = (searchParams.get('tags') || '').split(',').filter(Boolean).map(Number).filter(Number.isInteger);
  const [pipelineId, setPipelineId] = useState<number | null>(Number.isInteger(storedPipelineId) && storedPipelineId > 0 ? storedPipelineId : null);
  const [selectedTags, setSelectedTags] = useState<number[]>(storedTagIds);

  const updateFilters = (nextPipelineId: number | null, nextTagIds: number[]) => {
    const next = new URLSearchParams(searchParams);
    if (nextPipelineId) next.set('pipeline', String(nextPipelineId));
    else next.delete('pipeline');
    if (nextTagIds.length > 0) next.set('tags', nextTagIds.join(','));
    else next.delete('tags');
    setSearchParams(next);
  };

  // If viewer, we need to get accountId from JWT. Decode from token.
  const decodedAccountId = (() => {
    try {
      const token = localStorage.getItem('access_token');
      if (!token) return null;
      return JSON.parse(atob(token.split('.')[1])).accountId;
    } catch { return null; }
  })();
  const effectiveAccountId = accountId ?? (role === 'viewer' ? decodedAccountId : null);

  const accounts = useQuery({
    queryKey: ['accounts'],
    queryFn: () => userApi.pipelines(effectiveAccountId!).then(() => null).catch(() => null) as any,
    enabled: role === 'admin' && !paramAccountId,
  });
  const adminAccounts = useQuery({
    queryKey: ['admin-accounts'],
    queryFn: async () => {
      const r = await fetch('/api/admin/accounts', {
        headers: { Authorization: `Bearer ${localStorage.getItem('access_token') || ''}` },
        credentials: 'include',
      });
      return r.json();
    },
    enabled: role === 'admin' && !paramAccountId,
  });

  const pipelines = useQuery({
    queryKey: ['pipelines', effectiveAccountId],
    queryFn: () => userApi.pipelines(effectiveAccountId!),
    enabled: !!effectiveAccountId,
  });

  const tags = useQuery({
    queryKey: ['tags', effectiveAccountId],
    queryFn: () => userApi.tags(effectiveAccountId!),
    enabled: !!effectiveAccountId,
  });

  const stats = useQuery({
    queryKey: ['stats', pipelineId, selectedTags],
    queryFn: () => userApi.stagesStats(pipelineId!, selectedTags),
    enabled: !!pipelineId,
  });

  if (role === 'admin' && !paramAccountId && adminAccounts.data) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold mb-4">Выберите клиента</h1>
        <div className="grid grid-cols-2 gap-4">
          {adminAccounts.data?.map((a: any) => (
            <button key={a.id} onClick={() => nav(`/admin/stats/${a.id}`)}
              className="bg-white p-4 rounded shadow text-left hover:shadow-md">
              <div className="font-bold">{a.subdomain}</div>
              <div className="text-sm text-slate-600">{a.users?.[0]?.email}</div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  const freshness = stats.data?.dataFreshness || pipelines.data?.dataFreshness;

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-2xl font-bold">Воронки</h1>
          <div className="flex gap-2">
            <button onClick={() => nav(role === 'admin' ? `/admin/closed/${effectiveAccountId}` : '/closed')}
              className="text-sm bg-slate-200 px-3 py-1 rounded">Закрытые</button>
            <button onClick={() => nav(role === 'admin' ? `/admin/search/${effectiveAccountId}` : '/search')}
              className="text-sm bg-slate-200 px-3 py-1 rounded">Поиск</button>
          </div>
        </div>

        {freshness && (
          <div className={`mb-4 p-3 rounded text-sm ${freshness.isStale ? 'bg-yellow-50 text-yellow-800' : 'bg-green-50 text-green-800'}`}>
            {freshness.isStale ? '⚠️ Данные устарели. ' : '✓ '}
            Последняя синхронизация: {freshness.lastSyncedAt ? new Date(freshness.lastSyncedAt).toLocaleString() : 'не выполнялась'}
          </div>
        )}

        <div className="bg-white p-4 rounded shadow mb-4">
          <label className="block text-sm font-medium mb-2">Воронка</label>
          <select value={pipelineId || ''} onChange={e => {
            const nextPipelineId = parseInt(e.target.value, 10) || null;
            setPipelineId(nextPipelineId);
            updateFilters(nextPipelineId, selectedTags);
          }}
            className="w-full p-2 border rounded">
            <option value="">— выберите —</option>
            {pipelines.data?.items.map((p: any) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        {(tags.data?.items?.length ?? 0) > 0 && (
          <div className="bg-white p-4 rounded shadow mb-4">
            <label className="block text-sm font-medium mb-2">Фильтр по тегам</label>
            <div className="flex flex-wrap gap-2">
              {tags.data?.items?.map((t: any) => (
                <label key={t.id} className="flex items-center gap-1 text-sm">
                  <input type="checkbox" checked={selectedTags.includes(t.id)}
                    onChange={e => {
                      const nextTagIds = e.target.checked
                        ? [...selectedTags, t.id]
                        : selectedTags.filter(x => x !== t.id);
                      setSelectedTags(nextTagIds);
                      updateFilters(pipelineId, nextTagIds);
                    }} />
                  {t.name}
                </label>
              ))}
            </div>
          </div>
        )}

        {stats.data && (
          <div className="bg-white rounded shadow overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-100">
                <tr>
                  <th className="p-2 text-left">Этап</th>
                  <th className="p-2 text-right">Средн. время (факт)</th>
                  <th className="p-2 text-right">Средн. с перепрыгами</th>
                  <th className="p-2 text-right">Перепрыгов</th>
                  <th className="p-2 text-right">Активных</th>
                </tr>
              </thead>
              <tbody>
                {stats.data.items.map((s: any) => (
                  <tr key={s.stageId} className="border-t hover:bg-slate-50 cursor-pointer"
                    onClick={() => {
                      const path = role === 'admin' ? `/admin/stage/${s.stageId}` : `/stage/${s.stageId}`;
                      nav(selectedTags.length > 0 ? `${path}?tags=${selectedTags.join(',')}` : path);
                    }}>
                    <td className="p-2 font-medium">{s.name}</td>
                    <td className="p-2 text-right">{formatDuration(s.avgSecondsActual)}</td>
                    <td className="p-2 text-right">{formatDuration(s.avgSecondsIncludingSkips)}</td>
                    <td className="p-2 text-right">{s.skipsCount}</td>
                    <td className="p-2 text-right">{s.activeLeadsCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
