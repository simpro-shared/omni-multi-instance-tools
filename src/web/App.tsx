import { Route, Routes, NavLink, Navigate, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './lib/api';
import Unlock from './pages/Unlock';
import Dashboard from './pages/Dashboard';
import Instances from './pages/Instances';
import Migrate from './pages/Migrate';
import Documents from './pages/Documents';
import JobDetail from './pages/JobDetail';
import History from './pages/History';
import Settings from './pages/Settings';

export default function App() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ['unlock-status'],
    queryFn: api.unlockStatus,
  });

  if (isLoading) return <div className="p-8 text-zinc-400">loading…</div>;

  if (!data?.unlocked) return <Unlock vaultExists={data?.vaultExists ?? false} />;

  return (
    <div className="h-screen flex overflow-hidden">
      <aside className="w-48 shrink-0 border-r border-zinc-800 flex flex-col h-full">
        <div className="px-4 py-4 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded bg-blue-500 shrink-0" />
            <span className="text-sm font-semibold text-zinc-100 leading-tight">Omni Multi-Instance</span>
          </div>
        </div>
        <nav className="flex-1 py-3 flex flex-col gap-0.5 px-2">
          <SideNavLink to="/dashboard">Dashboard</SideNavLink>
          <SideNavLink to="/migrate">Migrate</SideNavLink>
          <SideNavLink to="/documents">Documents</SideNavLink>
          <SideNavLink to="/instances">Instances</SideNavLink>
          <SideNavLink to="/history">Migration History</SideNavLink>
        </nav>
        <div className="py-3 flex flex-col gap-0.5 px-2 border-t border-zinc-800">
          <SideNavLink to="/settings">Settings</SideNavLink>
          <button
            className="w-full text-left px-3 py-1.5 rounded text-sm text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/50 transition-colors"
            onClick={async () => {
              await api.lock();
              await qc.invalidateQueries({ queryKey: ['unlock-status'] });
              nav('/');
            }}
          >
            Lock vault
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto p-6">
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/migrate" element={<Migrate />} />
          <Route path="/documents" element={<Documents />} />
          <Route path="/instances" element={<Instances />} />
          <Route path="/jobs/:id" element={<JobDetail />} />
          <Route path="/history" element={<History />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
    </div>
  );
}

function SideNavLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `py-1.5 rounded text-sm transition-colors ${
          isActive
            ? 'pl-[10px] pr-3 bg-zinc-800/70 text-white border-l-2 border-blue-400'
            : 'px-3 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
        }`
      }
    >
      {children}
    </NavLink>
  );
}
