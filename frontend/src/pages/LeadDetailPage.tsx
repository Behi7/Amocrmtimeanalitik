import { useQuery } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import { userApi } from '../api/client';
import { format } from 'date-fns';
import { formatDate } from '../lib/utils';


export default function LeadDetailPage() {
  const { leadId } = useParams();
  const nav = useNavigate();
  const data = useQuery({
    queryKey: ['lead', leadId],
    queryFn: () => userApi.leadHistory(parseInt(leadId!, 10)),
  });

  if (!data.data) return <div className="p-8">Загрузка...</div>;
  const { lead, history, skips } = data.data;

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-4xl mx-auto">
        <button onClick={() => nav(-1)} className="mb-4 text-sm text-blue-600">← Назад</button>
        <div className="bg-white p-6 rounded shadow mb-4">
          <h1 className="text-2xl font-bold mb-2">{lead.name || '—'}</h1>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div><span className="text-slate-500">ID:</span> {lead.externalId?.toString()}</div>
            <div><span className="text-slate-500">Статус:</span> {lead.status}</div>
            <div><span className="text-slate-500">Цена:</span> {lead.price ? Number(lead.price).toLocaleString() : '—'}</div>
            <div><span className="text-slate-500">Создана:</span> {format(new Date(lead.crmCreatedAt), 'dd.MM.yyyy HH:mm')}</div>
            <div><span className="text-slate-500">Создана:</span> {formatDate(lead.crmCreatedAt, 'dd.MM.yyyy HH:mm')}</div>
          </div>
          {lead.leadTags?.length > 0 && (
            <div className="mt-3 flex gap-1 flex-wrap">
              {lead.leadTags.map((lt: any) => (
                <span key={lt.tagId} className="px-2 py-1 bg-slate-100 text-xs rounded">{lt.tag.name}</span>
              ))}
            </div>
          )}
        </div>

        <h2 className="text-lg font-bold mb-2">История этапов</h2>
        <div className="bg-white rounded shadow overflow-x-auto mb-4">
          <table className="w-full text-sm">
            <thead className="bg-slate-100">
              <tr>
                <th className="p-2 text-left">Этап</th>
                <th className="p-2 text-left">Вошёл</th>
                <th className="p-2 text-left">Вышел</th>
                <th className="p-2 text-left">Длительность</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h: any, i: number) => (
                <tr key={i} className="border-t">
                  <td className="p-2">{h.stage_name}</td>
                  <td className="p-2">{format(new Date(h.entered_at), 'dd.MM.yyyy HH:mm')}</td>
                  <td className="p-2">{h.exited_at ? format(new Date(h.exited_at), 'dd.MM.yyyy HH:mm') : 'текущий'}</td>
                  <td className="p-2">{formatDate(h.entered_at, 'dd.MM.yyyy HH:mm')}</td>
                  <td className="p-2">{h.exited_at ? formatDate(h.exited_at, 'dd.MM.yyyy HH:mm') : 'текущий'}</td>
                  <td className="p-2">{h.duration_seconds != null ? `${Math.floor(h.duration_seconds / 86400)}д ${Math.floor((h.duration_seconds % 86400) / 3600)}ч ${Math.floor((h.duration_seconds % 3600) / 60)}м` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {skips.length > 0 && (
          <>
            <h2 className="text-lg font-bold mb-2">Перепрыгнутые этапы</h2>
            <div className="bg-white rounded shadow overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-100">
                  <tr>
                    <th className="p-2 text-left">Когда</th>
                    <th className="p-2 text-left">Из</th>
                    <th className="p-2 text-left">В</th>
                    <th className="p-2 text-left">Пропущен</th>
                    <th className="p-2 text-left">Направление</th>
                  </tr>
                </thead>
                <tbody>
                  {skips.map((s: any, i: number) => (
                    <tr key={i} className="border-t">
                      <td className="p-2">{format(new Date(s.transition_at), 'dd.MM.yyyy HH:mm')}</td>
                      <td className="p-2">{formatDate(s.transition_at, 'dd.MM.yyyy HH:mm')}</td>
                      <td className="p-2">{s.from_stage_name}</td>
                      <td className="p-2">{s.to_stage_name}</td>
                      <td className="p-2 font-medium">{s.skipped_stage_name}</td>
                      <td className="p-2">{s.direction}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
