import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { userApi } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { formatDate } from '../lib/utils';

export default function ClosedLeadsPage() {
  const { role } = useAuth();
  const { accountId: paramAccountId } = useParams();
  const nav = useNavigate();
  const [status, setStatus] = useState<'won' | 'lost'>('won');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const perPage = 50;

  const decodedAccountId = (() => {
    try {
      const token = localStorage.getItem('access_token');
      if (!token) return null;
      return JSON.parse(atob(token.split('.')[1])).accountId;
    } catch { return null; }
  })();
  const effectiveAccountId = paramAccountId ? parseInt(paramAccountId, 10) : (role === 'viewer' ? decodedAccountId : null);

  useEffect(() => { setPage(1); }, [status, q]);

  const leads = useQuery({
    queryKey: ['closed', effectiveAccountId, status, q, page],
    queryFn: () => {
      if (!effectiveAccountId) return Promise.resolve({ items: [], total: 0 });
      if (q) return userApi.searchLeads(effectiveAccountId, q, page, perPage, [], status);
      return userApi.leadsByStatus(effectiveAccountId, status, page, perPage);
    },
    enabled: !!effectiveAccountId,
  });

  const totalPages = Math.max(1, Math.ceil((leads.data?.total || 0) / perPage));

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-5xl mx-auto">
        <button onClick={() => nav(-1)} className="mb-4 text-sm text-blue-600">← Назад</button>
        <h1 className="text-2xl font-bold mb-4">Закрытые сделки</h1>
        <div className="bg-white p-4 rounded shadow mb-4 flex gap-4">
          <select value={status} onChange={e => { setStatus(e.target.value as any); setPage(1); }} className="p-2 border rounded">
            <option value="won">Выигранные</option>
            <option value="lost">Проигранные</option>
          </select>
          <input type="text" placeholder="Поиск по названию" value={q}
            onChange={e => { setQ(e.target.value); setPage(1); }}
            className="flex-1 p-2 border rounded" />
        </div>
        <div className="bg-white rounded shadow overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-100">
              <tr>
                <th className="p-2 text-left">ID</th>
                <th className="p-2 text-left">Название</th>
                <th className="p-2 text-left">Цена</th>
                <th className="p-2 text-left">Закрыта</th>
                <th className="p-2 text-left">Статус</th>
              </tr>
            </thead>
            <tbody>
              {leads.data?.items.map((l: any) => (
                <tr key={l.id} className="border-t hover:bg-slate-50 cursor-pointer"
                  onClick={() => nav(role === 'admin' ? `/admin/lead/${l.id}` : `/lead/${l.id}`)}>
                  <td className="p-2">{l.external_id}</td>
                  <td className="p-2">{l.name || '—'}</td>
                  <td className="p-2">{l.price ? Number(l.price).toLocaleString() : '—'}</td>
                  <td className="p-2">{formatDate(l.crm_closed_at)}</td>
                  <td className="p-2">
                    <span className={`px-2 py-1 rounded text-xs ${l.status === 'won' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                      {l.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {leads.data && leads.data.total > 0 && (
          <div className="flex justify-between items-center mt-4 px-2">
            <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1}
              className="px-4 py-2 bg-white border rounded disabled:opacity-50 hover:bg-slate-50">
              ← Предыдущая
            </button>
            <span className="text-sm text-slate-600">
              Стр. {page} из {totalPages} · Всего: {leads.data.total}
            </span>
            <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page >= totalPages}
              className="px-4 py-2 bg-white border rounded disabled:opacity-50 hover:bg-slate-50">
              Следующая →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
