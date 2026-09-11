import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { userApi } from '../api/client';
import { useAuth } from '../auth/AuthContext';

export default function SearchPage() {
  const { role } = useAuth();
  const { accountId: paramAccountId } = useParams();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [submitted, setSubmitted] = useState('');
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

  useEffect(() => { setPage(1); }, [submitted]);

  const results = useQuery({
    queryKey: ['search', effectiveAccountId, submitted, page],
    queryFn: () => effectiveAccountId && submitted.length >= 2
      ? userApi.searchLeads(effectiveAccountId, submitted, page, perPage)
      : Promise.resolve({ items: [], total: 0, page: 1, perPage: perPage }),
    enabled: !!effectiveAccountId && submitted.length >= 2,
  });

  const totalPages = Math.max(1, Math.ceil((results.data?.total || 0) / perPage));

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-5xl mx-auto">
        <button onClick={() => nav(-1)} className="mb-4 text-sm text-blue-600">← Назад</button>
        <h1 className="text-2xl font-bold mb-4">Поиск сделок</h1>
        <div className="bg-white p-4 rounded shadow mb-4 flex gap-2">
          <input type="text" value={q} onChange={e => setQ(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { setSubmitted(q); setPage(1); } }}
            placeholder="Минимум 2 символа" className="flex-1 p-2 border rounded" />
          <button onClick={() => { setSubmitted(q); setPage(1); }}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">Искать</button>
        </div>
        {results.data?.items && results.data.items.length > 0 && (
          <div>
            <div className="bg-white rounded shadow overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-100">
                  <tr>
                    <th className="p-2 text-left">ID</th>
                    <th className="p-2 text-left">Название</th>
                    <th className="p-2 text-left">Статус</th>
                    <th className="p-2 text-left">Цена</th>
                  </tr>
                </thead>
                <tbody>
                  {results.data.items.map((l: any) => (
                    <tr key={l.id} className="border-t hover:bg-slate-50 cursor-pointer"
                      onClick={() => nav(role === 'admin' ? `/admin/lead/${l.id}` : `/lead/${l.id}`)}>
                      <td className="p-2">{l.external_id}</td>
                      <td className="p-2">{l.name || '—'}</td>
                      <td className="p-2">{l.status}</td>
                      <td className="p-2">{l.price ? Number(l.price).toLocaleString() : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-between items-center mt-4 px-2">
              <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1}
                className="px-4 py-2 bg-white border rounded disabled:opacity-50 hover:bg-slate-50">
                ← Предыдущая
              </button>
              <span className="text-sm text-slate-600">
                Стр. {page} из {totalPages} · Всего: {results.data.total}
              </span>
              <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page >= totalPages}
                className="px-4 py-2 bg-white border rounded disabled:opacity-50 hover:bg-slate-50">
                Следующая →
              </button>
            </div>
          </div>
        )}
        {results.data && results.data.items?.length === 0 && submitted.length >= 2 && (
          <div className="text-center text-slate-500 py-8">Ничего не найдено</div>
        )}
      </div>
    </div>
  );
}
