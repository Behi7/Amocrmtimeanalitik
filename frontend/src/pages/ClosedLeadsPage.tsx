import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { userApi } from '../api/client';
import { format } from 'date-fns';
import { useAuth } from '../auth/AuthContext';

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

  const leads = useQuery({
    queryKey: ['closed', effectiveAccountId, status, q, page],
    queryFn: () => {
      if (!effectiveAccountId) return Promise.resolve({ items: [], total: 0 });
      if (q) return userApi.searchLeads(effectiveAccountId, q, page, perPage);
      return userApi.leadsByStatus(effectiveAccountId, status, page, perPage);
    },
    enabled: !!effectiveAccountId,
  });

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-5xl mx-auto">
        <button onClick={() => nav(-1)} className="mb-4 text-sm text-blue-600">← Назад</button>
        <h1 className="text-2xl font-bold mb-4">Закрытые сделки</h1>
        <div className="bg-white p-4 rounded shadow mb-4 flex gap-4">
          <select value={status} onChange={e => setStatus(e.target.value as any)} className="p-2 border rounded">
            <option value="won">Выигранные</option>
            <option value="lost">Проигранные</option>
          </select>
          <input type="text" placeholder="Поиск по названию" value={q} onChange={e => setQ(e.target.value)}
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
                  onClick={() => nav(`/lead/${l.id}`)}>
                  <td className="p-2">{l.external_id}</td>
                  <td className="p-2">{l.name}</td>
                  <td className="p-2">{l.price ? Number(l.price).toLocaleString() : '—'}</td>
                  <td className="p-2">{l.crm_closed_at ? format(new Date(l.crm_closed_at), 'dd.MM.yyyy HH:mm') : '—'}</td>
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
      </div>
    </div>
  );
}
