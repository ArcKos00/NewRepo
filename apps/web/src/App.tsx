import { useEffect } from 'react';
import { Link, Navigate, NavLink, Route, Routes, useLocation } from 'react-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api, ApiError } from './api';
import { flush, startTracking, trackNavigation } from './tracking';
import { useLiveUpdates } from './live';
import { meQuery } from './user';
import { LoadError, Loading } from './components/ui';
import { ContractsPage } from './pages/ContractsPage';
import { DeliveriesPage } from './pages/DeliveriesPage';
import { ContractPage } from './pages/ContractPage';
import { ContractFormPage } from './pages/ContractFormPage';
import { DeliveryPage } from './pages/DeliveryPage';
import { ShortfallPage } from './pages/ShortfallPage';
import { AuditPage } from './pages/AuditPage';
import { LoginPage } from './pages/LoginPage';

export function App() {
  const location = useLocation();
  const flash = (location.state as { flash?: string } | null)?.flash;
  const onLogin = location.pathname === '/login';
  const me = useQuery({ ...meQuery, enabled: !onLogin });
  const user = me.data;

  useLiveUpdates(!!user);

  // Трасування — лише для того, хто увійшов (інакше нема кому приписати дію).
  useEffect(() => {
    if (user) startTracking();
  }, [user]);
  useEffect(() => {
    if (user) trackNavigation(location.pathname + location.search);
  }, [user, location.pathname, location.search]);

  const logout = useMutation({
    mutationFn: () => {
      flush();
      return api.logout();
    },
    onSuccess: ({ logoutUrl }) => window.location.assign(logoutUrl ?? '/login'),
  });

  if (onLogin) return <main className="wrap"><LoginPage /></main>;
  if (me.error instanceof ApiError && me.error.status === 401) {
    const back = location.pathname + location.search;
    return <Navigate to={`/login?returnTo=${encodeURIComponent(back)}`} replace />;
  }
  if (me.error) return <main className="wrap"><LoadError error={me.error} /></main>;
  if (!user) return <main className="wrap"><Loading /></main>;

  return (
    <>
      <header className="topbar">
        <div className="wrap">
          <Link to="/contracts" className="brand">Облік замовлень</Link>
          <nav className="nav">
            <NavLink to="/contracts" end className="btn">Замовлення</NavLink>
            <NavLink to="/deliveries" className="btn">Поставки</NavLink>
            {user.admin && <NavLink to="/audit" className="btn">Журнал</NavLink>}
            <NavLink to="/contracts/new" className="btn primary">+ Нове замовлення</NavLink>
          </nav>
          <div className="user">
            <span title={user.username}>{user.displayName ?? user.username}</span>
            <button className="btn sm" type="button" onClick={() => logout.mutate()} disabled={logout.isPending}>Вийти</button>
          </div>
        </div>
      </header>
      <main className="wrap">
        {flash && <div className="alert ok" role="status" key={location.key}>{flash}</div>}
        <Routes>
          <Route path="/" element={<ContractsPage />} />
          <Route path="/contracts" element={<ContractsPage />} />
          <Route path="/contracts/new" element={<ContractFormPage />} />
          <Route path="/contracts/:id" element={<ContractPage />} />
          <Route path="/contracts/:id/edit" element={<ContractFormPage />} />
          <Route path="/contracts/:id/deliveries/new" element={<DeliveryPage />} />
          <Route path="/contracts/:id/shortfall" element={<ShortfallPage />} />
          <Route path="/deliveries" element={<DeliveriesPage />} />
          <Route path="/audit" element={user.admin ? <AuditPage /> : <div className="panel empty">Журнал дій доступний лише адміністратору.</div>} />
          <Route path="*" element={<div className="panel empty">Сторінку не знайдено. <Link to="/contracts">До списку</Link></div>} />
        </Routes>
      </main>
    </>
  );
}
