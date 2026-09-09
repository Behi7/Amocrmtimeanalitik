import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { adminApi } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { Bell } from 'lucide-react';

export default function AdminClientsPage() {
  const { logout } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);

  const accounts = useQuery({ queryKey: ['accounts'], queryFn: adminApi.listAccounts });
  const notifs = useQuery({ queryKey: ['notifs'], queryFn: () => adminApi.listNotifications(true) });
  const createMut = useMutation({ mutationFn: adminApi.createAccount, onSuccess: () => { qc.invalidateQueries({ queryKey: ['accounts'] }); setShowForm(false); } });
  const patchMut = useMutation({ mutationFn: ({id,data}:any) => adminApi.patchAccount(id,data), onSuccess: () => { qc.invalidateQueries({ queryKey: ['accounts'] }); setEditId(null); } });
  const delMut = useMutation({ mutationFn: adminApi.deleteAccount, onSuccess: () => qc.invalidateQueries({ queryKey: ['accounts'] }) });
  const retryMut = useMutation({ mutationFn: adminApi.retryBackfill, onSuccess: () => qc.invalidateQueries({ queryKey: ['accounts'] }) });

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b px-6 py-4 flex justify-between items-center">
        <h1 className="text-xl font-bold">Клиенты</h1>
        <div className="flex items-center gap-4">
          <button onClick={() => nav('/admin/notifications')} className="relative p-2 hover:bg-slate-100 rounded">
            <Bell size={20} />
            {notifs.data && notifs.data.length > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                {notifs.data.length}
              </span>
            )}
          </button>
          <button onClick={logout} className="text-sm text-slate-600 hover:text-red-600">Выйти</button>
        </div>
      </header>
      <main className="p-6">
        <button onClick={() => { setEditId(null); setShowForm(true); }}
          className="mb-4 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">Добавить клиента</button>
        {(showForm || editId) && (
          <AccountForm
            initial={accounts.data?.find(a => a.id === editId)}
            onCancel={() => { setShowForm(false); setEditId(null); }}
            onSubmit={async (data: any) => {
              if (editId) await patchMut.mutateAsync({ id: editId, data });
              else await createMut.mutateAsync(data);
            }}
          />
        )}
        <div className="bg-white rounded shadow overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-100">
              <tr>
                <th className="p-2 text-left">Email</th>
                <th className="p-2 text-left">Subdomain</th>
                <th className="p-2 text-left">External ID</th>
                <th className="p-2 text-left">Статус токена</th>
                <th className="p-2 text-left">Backfill</th>
                <th className="p-2 text-left">Последняя синхр.</th>
                <th className="p-2 text-left">Действия</th>
              </tr>
            </thead>
            <tbody>
              {accounts.data?.map(a => (
                <tr key={a.id} className="border-t">
                  <td className="p-2">{a.users?.[0]?.email}</td>
                  <td className="p-2">{a.subdomain}</td>
                  <td className="p-2">{a.externalAccountId?.toString()}</td>
                  <td className="p-2">
                    <span className={`px-2 py-1 rounded text-xs ${
                      a.tokenStatus === 'active' ? 'bg-green-100 text-green-800' :
                      'bg-red-100 text-red-800'
                    }`}>{a.tokenStatus}</span>
                  </td>
                  <td className="p-2">
                    <span className={`px-2 py-1 rounded text-xs ${
                      a.backfillStatus === 'done' ? 'bg-green-100 text-green-800' :
                      a.backfillStatus === 'failed' ? 'bg-red-100 text-red-800' :
                      'bg-yellow-100 text-yellow-800'
                    }`}>{a.backfillStatus}</span>
                  </td>
                  <td className="p-2">{a.lastSyncedAt ? new Date(a.lastSyncedAt).toLocaleString() : '—'}</td>
                  <td className="p-2 flex gap-1">
                    <button onClick={() => nav(`/admin/stats/${a.id}`)} className="text-xs bg-slate-200 px-2 py-1 rounded hover:bg-slate-300">Стат.</button>
                    <button onClick={() => { setEditId(a.id); setShowForm(false); }} className="text-xs bg-blue-100 px-2 py-1 rounded hover:bg-blue-200">Изм.</button>
                    {a.backfillStatus === 'failed' && (
                      <button onClick={() => retryMut.mutate(a.id)} className="text-xs bg-orange-100 px-2 py-1 rounded hover:bg-orange-200">Повт.</button>
                    )}
                    <button onClick={() => { if (confirm('Удалить клиента?')) delMut.mutate(a.id); }}
                      className="text-xs bg-red-100 px-2 py-1 rounded hover:bg-red-200">Удал.</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}

function AccountForm({ initial, onCancel, onSubmit }: any) {
  const [email, setEmail] = useState(initial?.users?.[0]?.email || '');
  const [password, setPassword] = useState('');
  const [subdomain, setSubdomain] = useState(initial?.subdomain || '');
  const [token, setToken] = useState('');
  const [tokenExpiresAt, setTokenExpiresAt] = useState(initial?.tokenExpiresAt?.split('T')[0] || '');
  const [baseDomain, setBaseDomain] = useState(initial?.baseDomain || 'amocrm.ru');
  const [err, setErr] = useState('');

  const submit = async (e: any) => {
    e.preventDefault();
    setErr('');
    try {
      const data: any = {};
      if (!initial) {
        if (!email || !password || !subdomain || !token) { setErr('Все поля обязательны'); return; }
        data.email = email; data.password = password; data.subdomain = subdomain;
        data.token = token; data.baseDomain = baseDomain;
        if (tokenExpiresAt) data.tokenExpiresAt = tokenExpiresAt + 'T00:00:00Z';
      } else {
        if (email && email !== initial.users?.[0]?.email) data.email = email;
        if (password) data.password = password;
        if (token) data.token = token;
        if (tokenExpiresAt) data.tokenExpiresAt = tokenExpiresAt + 'T00:00:00Z';
      }
      await onSubmit(data);
    } catch (e: any) {
      setErr(e.message || 'Ошибка');
    }
  };

  return (
    <form onSubmit={submit} className="bg-white p-6 rounded shadow mb-6 grid grid-cols-2 gap-4">
      <h3 className="col-span-2 font-bold">{initial ? 'Редактирование' : 'Новый клиент'}</h3>
      {err && <div className="col-span-2 p-2 bg-red-50 text-red-700 text-sm rounded">{err}</div>}
      <div>
        <label className="block text-sm font-medium mb-1">Email</label>
        <input type="email" value={email} onChange={e => setEmail(e.target.value)}
          className="w-full p-2 border rounded" />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Пароль (min 12)</label>
        <input type="password" value={password} onChange={e => setPassword(e.target.value)}
          className="w-full p-2 border rounded" />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Subdomain {initial && '(не изменяется)'}</label>
        <input type="text" value={subdomain} onChange={e => setSubdomain(e.target.value)} disabled={!!initial}
          className="w-full p-2 border rounded disabled:bg-slate-100" />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Base Domain</label>
        <select value={baseDomain} onChange={e => setBaseDomain(e.target.value)} disabled={!!initial}
          className="w-full p-2 border rounded disabled:bg-slate-100">
          <option value="amocrm.ru">amocrm.ru</option>
          <option value="kommo.com">kommo.com</option>
        </select>
      </div>
      <div className="col-span-2">
        <label className="block text-sm font-medium mb-1">Токен amoCRM</label>
        <input type="password" value={token} onChange={e => setToken(e.target.value)}
          placeholder={initial ? 'Оставьте пустым, чтобы не менять' : ''}
          className="w-full p-2 border rounded" />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Истечение токена</label>
        <input type="date" value={tokenExpiresAt} onChange={e => setTokenExpiresAt(e.target.value)}
          className="w-full p-2 border rounded" />
      </div>
      <div className="col-span-2 flex gap-2">
        <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded">Сохранить</button>
        <button type="button" onClick={onCancel} className="bg-slate-200 px-4 py-2 rounded">Отмена</button>
      </div>
    </form>
  );
}
