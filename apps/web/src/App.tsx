import { Link, NavLink, Route, Routes, useLocation } from 'react-router';
import { ContractsPage } from './pages/ContractsPage';
import { ContractPage } from './pages/ContractPage';
import { ContractFormPage } from './pages/ContractFormPage';
import { DeliveryPage } from './pages/DeliveryPage';
import { ShortfallPage } from './pages/ShortfallPage';

export function App() {
  const location = useLocation();
  const flash = (location.state as { flash?: string } | null)?.flash;

  return (
    <>
      <header className="topbar">
        <div className="wrap">
          <Link to="/contracts" className="brand">Облік замовлень</Link>
          <nav className="nav">
            <NavLink to="/contracts" end className="btn">Замовлення</NavLink>
            <NavLink to="/contracts/new" className="btn primary">+ Нове замовлення</NavLink>
          </nav>
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
          <Route path="*" element={<div className="panel empty">Сторінку не знайдено. <Link to="/contracts">До списку</Link></div>} />
        </Routes>
      </main>
    </>
  );
}
