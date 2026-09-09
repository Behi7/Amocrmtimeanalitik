import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export default function LoginPage() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr('');
    setLoading(true);
    try {
      await login(email, password);
      nav('/');
    } catch (e: any) {
      setErr(e.message || 'Ошибка входа');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <form onSubmit={submit} className="bg-white p-8 rounded-lg shadow-md w-96">
        <h1 className="text-2xl font-bold mb-6">Вход в систему</h1>
        {err && <div className="mb-4 p-3 bg-red-50 text-red-700 rounded text-sm">{err}</div>}
        <div className="mb-4">
          <label className="block text-sm font-medium mb-1">Email</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
            className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none" />
        </div>
        <div className="mb-6">
          <label className="block text-sm font-medium mb-1">Пароль</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
            className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none" />
        </div>
        <button type="submit" disabled={loading}
          className="w-full bg-blue-600 text-white p-2 rounded hover:bg-blue-700 disabled:opacity-50">
          {loading ? 'Вход...' : 'Войти'}
        </button>
      </form>
    </div>
  );
}
