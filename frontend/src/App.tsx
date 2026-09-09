import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import LoginPage from './pages/LoginPage';
import AdminClientsPage from './pages/AdminClientsPage';
import AdminNotificationsPage from './pages/AdminNotificationsPage';
import StatsPage from './pages/StatsPage';
import StageLeadsPage from './pages/StageLeadsPage';
import LeadDetailPage from './pages/LeadDetailPage';
import ClosedLeadsPage from './pages/ClosedLeadsPage';
import SearchPage from './pages/SearchPage';

export default function App() {
  const { role, loading } = useAuth();
  if (loading) return <div className="p-8">Загрузка...</div>;
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      {role === 'admin' && (
        <>
          <Route path="/admin/clients" element={<AdminClientsPage />} />
          <Route path="/admin/notifications" element={<AdminNotificationsPage />} />
          <Route path="/admin/stats/:accountId" element={<StatsPage />} />
          <Route path="/admin/stage/:stageId" element={<StageLeadsPage />} />
          <Route path="/admin/lead/:leadId" element={<LeadDetailPage />} />
          <Route path="/admin/closed/:accountId" element={<ClosedLeadsPage />} />
          <Route path="/admin/search/:accountId" element={<SearchPage />} />
        </>
      )}
      {role === 'viewer' && (
        <>
          <Route path="/stats" element={<StatsPage />} />
          <Route path="/stage/:stageId" element={<StageLeadsPage />} />
          <Route path="/lead/:leadId" element={<LeadDetailPage />} />
          <Route path="/closed" element={<ClosedLeadsPage />} />
          <Route path="/search" element={<SearchPage />} />
        </>
      )}
      <Route path="*" element={<Navigate to={role === 'admin' ? '/admin/clients' : role === 'viewer' ? '/stats' : '/login'} replace />} />
    </Routes>
  );
}
