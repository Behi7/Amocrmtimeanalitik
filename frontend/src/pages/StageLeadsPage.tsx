import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import { userApi } from '../api/client';
import { format } from 'date-fns';

export default function StageLeadsPage() {
  const { stageId } = useParams();
  const nav = useNavigate();
  const [page, setPage] = useState(1);
  const perPage = 50;

  const leads = useQuery({
    queryKey: ['stageLeads', stageId, page],
    queryFn: () => userApi.activeLeads(parseInt(stageId!, 10), page, perPage),
  });

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-5xl mx-auto">
        <button onClick={() => nav(-1)} className="mb-4 text-sm text-blue-600">← Назад</button>
        <h1 className="text-2xl font-bold mb-4">Сделки на этапе</h1>
        <div className="bg-white rounded shadow overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-100">
              <tr>
                <th className="p-2 text-left">ID</th>
                <th className="p-2 text-left">Название</th>
                <th className="p-2 text-left">Цена</th>
                <th className="p-2 text-left">На этапе с</th>
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
                  <td className="p-2">{format(new Date(l.entered_at), 'dd.MM.yyyy HH:mm')}</td>
                  <td className="p-2">
                    <span className={`px-2 py-1 rounded text-xs ${
                      l.status === 'open' ? 'bg-blue-100 text-blue-800' :
                      l.status === 'won' ? 'bg-green-100 text-green-800' :
                      'bg-red-100 text-red-800'
                    }`}>{l.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {leads.data && (
          <div className="flex justify-between items-center mt-4">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              className="px-4 py-2 bg-white border rounded disabled:opacity-50">Предыдущая</button>
            <span>Стр. {page} из {Math.ceil((leads.data.total || 1) / perPage)}</span>
            <button onClick={() => setPage(p => p + 1)} disabled={page * perPage >= leads.data.total}
              className="px-4 py-2 bg-white border rounded disabled:opacity-50">Следующая</button>
          </div>
        )}
      </div>
    </div>
  );
}
