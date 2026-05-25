import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import type { InstancePublic } from '../../shared/types';
import type { ConnectionStat, EmbedUserStat, InstanceDashboardStats, InstanceEmbedUserStats } from '../lib/api';

// --- localStorage helpers ---

const lsKey = {
  excluded: (id: string) => `dashboard:excluded:${id}`,
  connectionsCache: 'dashboard:cache:connections',
  usersCache: 'dashboard:cache:users',
};

function lsGetCache<T>(key: string): { data: T; fetchedAt: number } | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as { data: T; fetchedAt: number }) : null;
  } catch {
    return null;
  }
}

function lsSetCache<T>(key: string, data: T, fetchedAt: number): void {
  localStorage.setItem(key, JSON.stringify({ data, fetchedAt }));
}

function useElapsed(timestampMs: number): string {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick(n => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
  if (!timestampMs) return 'never fetched';
  const secs = Math.floor((Date.now() - timestampMs) / 1000);
  if (secs < 60) return `${secs}s ago`;
  return `${Math.floor(secs / 60)}m ago`;
}

function lsGetExcluded(instanceId: string): Set<string> {
  try {
    const raw = localStorage.getItem(lsKey.excluded(instanceId));
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function lsSetExcluded(instanceId: string, excluded: Set<string>): void {
  localStorage.setItem(lsKey.excluded(instanceId), JSON.stringify([...excluded]));
}

// --- Dashboard ---

type DashTab = 'connections' | 'users';

export default function Dashboard() {
  const nav = useNavigate();
  const [activeTab, setActiveTab] = useState<DashTab>('connections');

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-1 border-b border-zinc-800">
        <TabButton label="Connections" active={activeTab === 'connections'} onClick={() => setActiveTab('connections')} />
        <TabButton label="Users" active={activeTab === 'users'} onClick={() => setActiveTab('users')} />
      </div>
      {activeTab === 'connections' ? <ConnectionsTab nav={nav} /> : <UsersTab nav={nav} />}
    </div>
  );
}

function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
        active
          ? 'border-zinc-200 text-zinc-100'
          : 'border-transparent text-zinc-500 hover:text-zinc-300'
      }`}
    >
      {label}
    </button>
  );
}

// --- Connections Tab ---

function ConnectionsTab({ nav }: { nav: ReturnType<typeof useNavigate> }) {
  const cached = lsGetCache<InstanceDashboardStats[]>(lsKey.connectionsCache);
  const { data: instances } = useQuery<InstancePublic[]>({ queryKey: ['instances'], queryFn: api.listInstances, staleTime: Infinity });
  const { data: allData, isLoading, error, refetch, isFetching, dataUpdatedAt } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: api.getDashboardStats,
    staleTime: Infinity,
    initialData: cached?.data,
    initialDataUpdatedAt: cached?.fetchedAt,
  });
  const elapsed = useElapsed(dataUpdatedAt);

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState<Record<string, string>>({});
  const [excluded, setExcluded] = useState<Record<string, Set<string>>>({});

  useEffect(() => {
    if (!allData) return;
    lsSetCache(lsKey.connectionsCache, allData, dataUpdatedAt);
    setExcluded(prev => {
      const next: Record<string, Set<string>> = { ...prev };
      for (const inst of allData) {
        if (!next[inst.instanceId]) {
          next[inst.instanceId] = lsGetExcluded(inst.instanceId);
        }
      }
      return next;
    });
  }, [allData, dataUpdatedAt]);

  const data = allData;

  const toggleExpand = (id: string) =>
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const toggleExclude = (instanceId: string, connectionId: string) => {
    setExcluded(prev => {
      const set = new Set(prev[instanceId] ?? []);
      set.has(connectionId) ? set.delete(connectionId) : set.add(connectionId);
      lsSetExcluded(instanceId, set);
      return { ...prev, [instanceId]: set };
    });
  };

  if (isLoading) return <div className="text-zinc-400 text-sm">Loading…</div>;

  if (error) {
    return (
      <div className="text-red-400 text-sm">
        Failed to load stats: {error instanceof Error ? error.message : 'unknown error'}
      </div>
    );
  }

  if (!data || data.length === 0) {
    const hasInstances = instances && instances.length > 0;
    const allDisabled = hasInstances && instances.every(i => i.dashboardEnabled === false);
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
        <p className="text-zinc-400 text-sm">
          {allDisabled
            ? 'All instances are disabled on the dashboard. Enable them from the Instances tab.'
            : 'No instances configured.'}
        </p>
        <button
          className="px-4 py-2 text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded"
          onClick={() => nav('/instances')}
        >
          Go to Instances →
        </button>
      </div>
    );
  }

  const totalConnections = data.reduce((sum, i) => {
    const ex = excluded[i.instanceId] ?? new Set();
    return sum + i.connections.filter(c => !ex.has(c.id)).length;
  }, 0);
  const totalMissing = data.reduce((sum, i) => {
    const ex = excluded[i.instanceId] ?? new Set();
    return sum + i.connections.filter(c => !c.hasSchemaModel && !ex.has(c.id)).length;
  }, 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h2 className="text-zinc-200 font-semibold text-lg">Connections</h2>
        <div className="flex items-center gap-2">
          <button
            className="text-xs text-zinc-400 hover:text-zinc-200 disabled:opacity-40"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            {isFetching ? 'refreshing…' : 'refresh'}
          </button>
          <span className="text-xs text-zinc-600">{elapsed}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatCard label="Instances" value={data.length} />
        <StatCard label="Total Connections" value={totalConnections} />
        <StatCard label="Missing Schema Model" value={totalMissing} highlight={totalMissing > 0} />
      </div>

      <div className="flex flex-col gap-3">
        {data.map(inst => (
          <InstanceCard
            key={inst.instanceId}
            inst={inst}
            isExpanded={expanded.has(inst.instanceId)}
            onToggleExpand={() => toggleExpand(inst.instanceId)}
            search={search[inst.instanceId] ?? ''}
            onSearchChange={v => setSearch(prev => ({ ...prev, [inst.instanceId]: v }))}
            excludedIds={excluded[inst.instanceId] ?? new Set()}
            onToggleExclude={connId => toggleExclude(inst.instanceId, connId)}
          />
        ))}
      </div>
    </div>
  );
}

// --- Users Tab ---

const ALL_EMBED_USERS_GROUP = 'All Embed Users';

function UsersTab({ nav }: { nav: ReturnType<typeof useNavigate> }) {
  const cached = lsGetCache<InstanceEmbedUserStats[]>(lsKey.usersCache);
  const { data: instances } = useQuery<InstancePublic[]>({ queryKey: ['instances'], queryFn: api.listInstances, staleTime: Infinity });
  const { data: allData, isLoading, error, refetch, isFetching, dataUpdatedAt } = useQuery({
    queryKey: ['dashboard-embed-users'],
    queryFn: api.getEmbedUserStats,
    staleTime: Infinity,
    initialData: cached?.data,
    initialDataUpdatedAt: cached?.fetchedAt,
  });
  const elapsed = useElapsed(dataUpdatedAt);

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState<Record<string, string>>({});

  useEffect(() => {
    if (allData) lsSetCache(lsKey.usersCache, allData, dataUpdatedAt);
  }, [allData, dataUpdatedAt]);

  const data = allData;

  const toggleExpand = (id: string) =>
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  if (isLoading) return <div className="text-zinc-400 text-sm">Loading…</div>;

  if (error) {
    return (
      <div className="text-red-400 text-sm">
        Failed to load users: {error instanceof Error ? error.message : 'unknown error'}
      </div>
    );
  }

  if (!data || data.length === 0) {
    const hasInstances = instances && instances.length > 0;
    const allDisabled = hasInstances && instances.every(i => i.dashboardEnabled === false);
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
        <p className="text-zinc-400 text-sm">
          {allDisabled
            ? 'All instances are disabled on the dashboard. Enable them from the Instances tab.'
            : 'No instances configured.'}
        </p>
        <button
          className="px-4 py-2 text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded"
          onClick={() => nav('/instances')}
        >
          Go to Instances →
        </button>
      </div>
    );
  }

  const totalUsers = data.reduce((sum, i) => sum + i.users.length, 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h2 className="text-zinc-200 font-semibold text-lg">Embed Users</h2>
        <div className="flex items-center gap-2">
          <button
            className="text-xs text-zinc-400 hover:text-zinc-200 disabled:opacity-40"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            {isFetching ? 'refreshing…' : 'refresh'}
          </button>
          <span className="text-xs text-zinc-600">{elapsed}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatCard label="Instances" value={data.length} />
        <StatCard label="Total Embed Users" value={totalUsers} />
      </div>

      <div className="flex flex-col gap-3">
        {data.map(inst => (
          <UserInstanceCard
            key={inst.instanceId}
            inst={inst}
            isExpanded={expanded.has(inst.instanceId)}
            onToggleExpand={() => toggleExpand(inst.instanceId)}
            search={search[inst.instanceId] ?? ''}
            onSearchChange={v => setSearch(prev => ({ ...prev, [inst.instanceId]: v }))}
          />
        ))}
      </div>
    </div>
  );
}

function UserInstanceCard({
  inst,
  isExpanded,
  onToggleExpand,
  search,
  onSearchChange,
}: {
  inst: InstanceEmbedUserStats;
  isExpanded: boolean;
  onToggleExpand: () => void;
  search: string;
  onSearchChange: (v: string) => void;
}) {
  const groups = groupUsersByGroup(inst.users);
  const groupNames = Object.keys(groups).sort();

  const filteredGroups: Record<string, EmbedUserStat[]> = {};
  if (search.trim()) {
    const q = search.toLowerCase();
    for (const g of groupNames) {
      const matched = groups[g]!.filter(
        u =>
          u.displayName.toLowerCase().includes(q) ||
          u.embedExternalId.toLowerCase().includes(q) ||
          u.userName.toLowerCase().includes(q)
      );
      if (matched.length > 0) filteredGroups[g] = matched;
    }
  } else {
    for (const g of groupNames) filteredGroups[g] = groups[g]!;
  }

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900">
      <button
        className="w-full flex items-center justify-between gap-2 p-4 text-left"
        onClick={onToggleExpand}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-zinc-400 text-xs w-3">{isExpanded ? '▾' : '▸'}</span>
          <span className="text-zinc-100 font-medium truncate">{inst.instanceLabel}</span>
          <span className="text-xs px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 capitalize shrink-0">
            {inst.instanceRole}
          </span>
        </div>
        <div className="flex items-center gap-3 shrink-0 text-xs">
          {inst.error ? (
            <span className="text-red-400">error</span>
          ) : (
            <>
              <span className="text-zinc-400">
                <span className="text-zinc-200 font-medium">{inst.users.length}</span>
                {' '}user{inst.users.length !== 1 ? 's' : ''}
              </span>
              <span className="text-zinc-600">{groupNames.length} group{groupNames.length !== 1 ? 's' : ''}</span>
            </>
          )}
          <span className="text-zinc-600">{new URL(inst.baseUrl).hostname}</span>
        </div>
      </button>

      {isExpanded && (
        <div className="border-t border-zinc-800 px-4 pb-4 pt-3 flex flex-col gap-3">
          {inst.error ? (
            <p className="text-xs text-red-400">Error: {inst.error}</p>
          ) : (
            <>
              <input
                type="search"
                value={search}
                onChange={e => onSearchChange(e.target.value)}
                placeholder="Search users…"
                className="w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500"
              />
              {Object.keys(filteredGroups).length === 0 ? (
                <p className="text-xs text-zinc-500">No users match.</p>
              ) : (
                <div className="flex flex-col gap-4">
                  {Object.keys(filteredGroups).sort().map(groupName => (
                    <div key={groupName}>
                      <div className="text-xs font-medium text-zinc-400 mb-1.5">{groupName} <span className="text-zinc-600">({filteredGroups[groupName]!.length})</span></div>
                      <UserTable users={filteredGroups[groupName]!} />
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function groupUsersByGroup(users: EmbedUserStat[]): Record<string, EmbedUserStat[]> {
  const out: Record<string, EmbedUserStat[]> = {};
  for (const u of users) {
    const relevantGroups = u.groups.filter(g => g.display !== ALL_EMBED_USERS_GROUP);
    if (relevantGroups.length === 0) {
      const key = '(No Group)';
      (out[key] ??= []).push(u);
    } else {
      for (const g of relevantGroups) {
        (out[g.display] ??= []).push(u);
      }
    }
  }
  return out;
}

function UserTable({ users }: { users: EmbedUserStat[] }) {
  return (
    <table className="w-full text-xs border-collapse">
      <thead>
        <tr className="border-b border-zinc-800 text-zinc-500 text-left">
          <th className="pb-1 pr-4 font-normal">Display Name</th>
          <th className="pb-1 pr-4 font-normal">External ID</th>
          <th className="pb-1 font-normal">Status</th>
        </tr>
      </thead>
      <tbody>
        {users.map(u => (
          <tr key={u.id} className="border-b border-zinc-800/50 last:border-0">
            <td className="py-1.5 pr-4 text-zinc-300">{u.displayName}</td>
            <td className="py-1.5 pr-4 text-zinc-400 font-mono">{u.embedExternalId || '—'}</td>
            <td className="py-1.5">
              {u.active
                ? <span className="text-emerald-400">active</span>
                : <span className="text-zinc-600">inactive</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// --- Sub-components ---

function StatCard({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
      <div className={`text-2xl font-bold ${highlight ? 'text-amber-400' : 'text-zinc-100'}`}>
        {value}
      </div>
      <div className="text-xs text-zinc-400 mt-1">{label}</div>
    </div>
  );
}

type RefreshStatus = 'idle' | 'pending' | 'ok' | 'error';
function InstanceCard({
  inst,
  isExpanded,
  onToggleExpand,
  search,
  onSearchChange,
  excludedIds,
  onToggleExclude,
}: {
  inst: InstanceDashboardStats;
  isExpanded: boolean;
  onToggleExpand: () => void;
  search: string;
  onSearchChange: (v: string) => void;
  excludedIds: Set<string>;
  onToggleExclude: (id: string) => void;
}) {
  const [refreshStatus, setRefreshStatus] = useState<Record<string, RefreshStatus>>({});
  const [refreshError, setRefreshError] = useState<Record<string, string>>({});

  const activeConnections = inst.connections.filter(c => !excludedIds.has(c.id));
  const missing = activeConnections.filter(c => !c.hasSchemaModel);
  const excludedCount = inst.connections.length - activeConnections.length;

  const filtered = (search.trim()
    ? inst.connections.filter(
        c =>
          c.name.toLowerCase().includes(search.toLowerCase()) ||
          c.database.toLowerCase().includes(search.toLowerCase()) ||
          c.dialect.toLowerCase().includes(search.toLowerCase())
      )
    : inst.connections
  ).slice().sort((a, b) => (a.hasSchemaModel ? 1 : 0) - (b.hasSchemaModel ? 1 : 0));

  const refreshOne = async (c: ConnectionStat) => {
    if (!c.schemaModelId) return;
    setRefreshStatus(prev => ({ ...prev, [c.id]: 'pending' }));
    setRefreshError(prev => { const n = { ...prev }; delete n[c.id]; return n; });
    try {
      await api.refreshSchema(inst.instanceId, c.schemaModelId);
      setRefreshStatus(prev => ({ ...prev, [c.id]: 'ok' }));
    } catch (err) {
      setRefreshStatus(prev => ({ ...prev, [c.id]: 'error' }));
      setRefreshError(prev => ({ ...prev, [c.id]: err instanceof Error ? err.message : 'failed' }));
    }
  };


  const refreshAll = () => {
    const targets = activeConnections.filter(c => c.schemaModelId && !c.hasSchemaModel);
    for (const c of targets) refreshOne(c);
  };

  const bulkPending = activeConnections.some(c => refreshStatus[c.id] === 'pending');
  const refreshableCount = activeConnections.filter(c => c.schemaModelId && !c.hasSchemaModel).length;

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900">
      <button
        className="w-full flex items-center justify-between gap-2 p-4 text-left"
        onClick={onToggleExpand}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-zinc-400 text-xs w-3">{isExpanded ? '▾' : '▸'}</span>
          <span className="text-zinc-100 font-medium truncate">{inst.instanceLabel}</span>
          <span className="text-xs px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 capitalize shrink-0">
            {inst.instanceRole}
          </span>
        </div>

        <div className="flex items-center gap-3 shrink-0 text-xs">
          {inst.error ? (
            <span className="text-red-400">error</span>
          ) : (
            <>
              <span className="text-zinc-400">
                <span className="text-zinc-200 font-medium">{activeConnections.length}</span>
                {excludedCount > 0 && (
                  <span className="text-zinc-600"> ({excludedCount} excluded)</span>
                )}
                {' '}connection{activeConnections.length !== 1 ? 's' : ''}
              </span>
              {missing.length > 0 && (
                <span className="text-amber-400">{missing.length} missing schema</span>
              )}
            </>
          )}
          <span className="text-zinc-600">{new URL(inst.baseUrl).hostname}</span>
        </div>
      </button>

      {isExpanded && (
        <div className="border-t border-zinc-800 px-4 pb-4 pt-3 flex flex-col gap-3">
          {inst.error ? (
            <p className="text-xs text-red-400">Error: {inst.error}</p>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <input
                  type="search"
                  value={search}
                  onChange={e => onSearchChange(e.target.value)}
                  placeholder="Search connections…"
                  className="flex-1 bg-zinc-950 border border-zinc-700 rounded px-3 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500"
                />
                {refreshableCount > 0 && (
                  <button
                    onClick={refreshAll}
                    disabled={bulkPending}
                    title={`Refresh schema for all ${refreshableCount} non-excluded connection${refreshableCount !== 1 ? 's' : ''}`}
                    className="shrink-0 px-2.5 py-1.5 text-xs rounded border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-zinc-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    {bulkPending ? 'refreshing…' : `Refresh All (${refreshableCount})`}
                  </button>
                )}
              </div>
              {filtered.length === 0 ? (
                <p className="text-xs text-zinc-500">No connections match.</p>
              ) : (
                <ConnectionTable
                  connections={filtered}
                  excludedIds={excludedIds}
                  onToggleExclude={onToggleExclude}
                  refreshStatus={refreshStatus}
                  refreshError={refreshError}
                  onRefresh={refreshOne}
                />
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function timeAgo(iso: string): { label: string; overdue: boolean } {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  const hours = Math.floor(mins / 60);
  let label: string;
  if (mins < 1) label = 'just now';
  else if (mins < 60) label = `${mins}m ago`;
  else label = `${hours}h ${mins % 60}m ago`;
  return { label, overdue: mins > 30 };
}

function SchemaAge({ updatedAt }: { updatedAt: string }) {
  const { label, overdue } = timeAgo(updatedAt);
  return (
    <span className={`ml-1.5 ${overdue ? 'text-red-400' : 'text-amber-500/70'}`} title={`Last updated: ${new Date(updatedAt).toLocaleString()}`}>
      ({label}{overdue ? ' — overdue' : ''})
    </span>
  );
}

function ConnectionTable({
  connections,
  excludedIds,
  onToggleExclude,
  refreshStatus,
  refreshError,
  onRefresh,
}: {
  connections: ConnectionStat[];
  excludedIds: Set<string>;
  onToggleExclude: (id: string) => void;
  refreshStatus: Record<string, RefreshStatus>;
  refreshError: Record<string, string>;
  onRefresh: (c: ConnectionStat) => void;
}) {
  return (
    <table className="w-full text-xs border-collapse">
      <thead>
        <tr className="border-b border-zinc-800 text-zinc-500 text-left">
          <th className="pb-1 pr-4 font-normal">Name</th>
          <th className="pb-1 pr-4 font-normal">Database</th>
          <th className="pb-1 pr-4 font-normal">Dialect</th>
          <th className="pb-1 pr-4 font-normal">Schema Model</th>
          <th className="pb-1 pr-2 font-normal text-center">Refresh Schema</th>
          <th className="pb-1 font-normal text-right">Count</th>
        </tr>
      </thead>
      <tbody>
        {connections.map(c => {
          const isExcluded = excludedIds.has(c.id);
          const status = refreshStatus[c.id] ?? 'idle';
          const errMsg = refreshError[c.id];
          return (
            <tr
              key={c.id}
              className={`border-b border-zinc-800/50 last:border-0 ${isExcluded ? 'opacity-40' : ''}`}
            >
              <td className="py-1.5 pr-4 text-zinc-300">{c.name}</td>
              <td className="py-1.5 pr-4 text-zinc-400">{c.database}</td>
              <td className="py-1.5 pr-4 text-zinc-400">{c.dialect}</td>
              <td className="py-1.5 pr-4">
                {c.hasSchemaModel ? (
                  <span className="text-emerald-400">✓</span>
                ) : (
                  <span className="text-amber-400">
                    missing
                    {c.schemaModelUpdatedAt && <SchemaAge updatedAt={c.schemaModelUpdatedAt} />}
                  </span>
                )}
              </td>
              <td className="py-1.5 pr-2 text-center">
                {c.schemaModelId ? (
                  <button
                    onClick={() => onRefresh(c)}
                    disabled={status === 'pending'}
                    title={errMsg ?? (status === 'ok' ? 'Refresh queued' : 'Refresh schema')}
                    className={`px-1.5 py-0.5 rounded text-xs transition-colors disabled:cursor-not-allowed ${
                      status === 'pending' ? 'text-zinc-500' :
                      status === 'ok' ? 'text-emerald-400 hover:text-emerald-300' :
                      status === 'error' ? 'text-red-400 hover:text-red-300' :
                      'text-zinc-600 hover:text-zinc-300'
                    }`}
                  >
                    {status === 'pending' ? '…' : status === 'ok' ? '✓' : status === 'error' ? '✗' : '↻'}
                  </button>
                ) : (
                  <span className="text-zinc-700">—</span>
                )}
              </td>
              <td className="py-1.5 text-right">
                <button
                  onClick={() => onToggleExclude(c.id)}
                  title={isExcluded ? 'Include in count' : 'Exclude from count'}
                  className="text-zinc-600 hover:text-zinc-300 transition-colors px-1"
                >
                  {isExcluded ? 'include' : 'exclude'}
                </button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
