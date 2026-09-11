import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '../api/client';

export default function AdminNotificationsPage() {
  const qc = useQueryClient();
  const [unreadOnly, setUnreadOnly] = useState(true);
  const notifs = useQuery({ queryKey: ['notifs', unreadOnly], queryFn: () => adminApi.listNotifications(unreadOnly) });
  const readMut = useMutation({
    mutationFn: adminApi.readNotification,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifs'] }),
  });

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold mb-4">Уведомления</h1>
        <label className="flex items-center gap-2 mb-4">
          <input type="checkbox" checked={unreadOnly} onChange={e => setUnreadOnly(e.target.checked)} />
          Только непрочитанные
        </label>
        <div className="bg-white rounded shadow divide-y">
          {notifs.data?.map(n => (
            <div key={n.id} className="p-4 flex justify-between items-center">
              <div>
                <div className="font-medium">{n.type}</div>
                <div className="text-sm text-slate-600">{n.message}</div>
                <div className="text-xs text-slate-400">{new Date(n.createdAt).toLocaleString()}</div>
              </div>
              {!n.isRead && (
                <button onClick={() => readMut.mutate(n.id)} className="text-sm text-blue-600">Прочитано</button>
              )}
            </div>
          ))}
          {notifs.data?.length === 0 && <div className="p-8 text-center text-slate-500">Нет уведомлений</div>}
        </div>
      </div>
    </div>
  );
}

import { useState } from 'react';
