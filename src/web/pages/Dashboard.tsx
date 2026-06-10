import { memo, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  BarChart as ReBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  LabelList,
  ResponsiveContainer,
} from 'recharts';
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

function formatElapsed(timestampMs: number): string {
  if (!timestampMs) return 'never fetched';
  const secs = Math.floor((Date.now() - timestampMs) / 1000);
  if (secs < 60) return `${secs}s ago`;
  return `${Math.floor(secs / 60)}m ago`;
}

function ElapsedLabel({ timestampMs }: { timestampMs: number }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick(n => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
  return <span className="text-xs text-zinc-600">{formatElapsed(timestampMs)}</span>;
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

// --- Date range helpers ---

function endOfDay(dateStr: string): Date {
  const d = new Date(dateStr);
  d.setHours(23, 59, 59, 999);
  return d;
}

function DateRangePicker({
  from,
  to,
  onChange,
}: {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
}) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-zinc-500 shrink-0">Date range:</span>
      <input
        type="date"
        value={from}
        onChange={e => onChange(e.target.value, to)}
        className="bg-zinc-950 border border-zinc-700 rounded px-2 py-1 text-zinc-200 focus:outline-none focus:border-blue-500/60 [color-scheme:dark]"
      />
      <span className="text-zinc-600">–</span>
      <input
        type="date"
        value={to}
        onChange={e => onChange(from, e.target.value)}
        className="bg-zinc-950 border border-zinc-700 rounded px-2 py-1 text-zinc-200 focus:outline-none focus:border-blue-500/60 [color-scheme:dark]"
      />
      {(from || to) && (
        <button onClick={() => onChange('', '')} className="text-zinc-600 hover:text-zinc-400 ml-1">
          clear
        </button>
      )}
    </div>
  );
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
          ? 'border-blue-400 text-blue-300'
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

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [globalSearch, setGlobalSearch] = useState('');
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
    const allDisabled = hasInstances && instances.every(i => i.dashboardTabs && !i.dashboardTabs.includes('connections'));
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
        <p className="text-zinc-400 text-sm">
          {allDisabled
            ? 'No instances are enabled for the Connections tab. Configure them from the Instances tab.'
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
    return sum + i.connections.filter(c => !ex.has(c.id) && !c.filtered).length;
  }, 0);
  const totalFilteredConnections = data.reduce((sum, i) => sum + (i.filteredCount ?? 0), 0);
  const totalMissing = data.reduce((sum, i) => {
    const ex = excluded[i.instanceId] ?? new Set();
    return sum + i.connections.filter(c => !c.hasSchemaModel && !ex.has(c.id) && !c.filtered).length;
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
          <ElapsedLabel timestampMs={dataUpdatedAt} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatCard label="Instances" value={data.length} />
        <StatCard label="Total Connections" value={totalConnections} filtered={totalFilteredConnections || undefined} />
        <StatCard label="Missing Schema Model" value={totalMissing} highlight={totalMissing > 0} />
      </div>

      <input
        type="search"
        value={globalSearch}
        onChange={e => setGlobalSearch(e.target.value)}
        placeholder="Search all connections across instances…"
        className="w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-blue-500/60 focus:ring-1 focus:ring-blue-500/20"
      />

      {globalSearch.trim() ? (
        <GlobalConnectionResults
          data={data}
          excluded={excluded}
          query={globalSearch.trim()}
          onToggleExclude={toggleExclude}
        />
      ) : (
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
      )}
    </div>
  );
}

// --- Users Tab ---

const ALL_EMBED_USERS_GROUP = 'All Embed Users';

function UsersTab({ nav }: { nav: ReturnType<typeof useNavigate> }) {
  const cached = lsGetCache<InstanceEmbedUserStats[]>(lsKey.usersCache);
  const { data: instances } = useQuery<InstancePublic[]>({ queryKey: ['instances'], queryFn: api.listInstances, staleTime: Infinity });
  const { data: connectionsData } = useQuery({ queryKey: ['dashboard-stats'], queryFn: api.getDashboardStats, staleTime: Infinity });
  const { data: allData, isLoading, error, refetch, isFetching, dataUpdatedAt } = useQuery({
    queryKey: ['dashboard-embed-users'],
    queryFn: api.getEmbedUserStats,
    staleTime: Infinity,
    initialData: cached?.data,
    initialDataUpdatedAt: cached?.fetchedAt,
  });

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [globalSearch, setGlobalSearch] = useState('');
  const [search, setSearch] = useState<Record<string, string>>({});
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [drawer, setDrawer] = useState<{ title: string; rows: { primary: string; secondary?: string }[]; filteredRows?: { primary: string; secondary?: string }[] } | null>(null);

  useEffect(() => {
    if (allData) lsSetCache(lsKey.usersCache, allData, dataUpdatedAt);
  }, [allData, dataUpdatedAt]);

  const data = useMemo(() => {
    if (!allData || !dateTo) return allData;
    const end = endOfDay(dateTo);
    return allData.map(inst => ({
      ...inst,
      users: inst.users.filter(u => !u.createdAt || new Date(u.createdAt) <= end),
    }));
  }, [allData, dateTo]);

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
    const allDisabled = hasInstances && instances.every(i => i.dashboardTabs && !i.dashboardTabs.includes('users'));
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
        <p className="text-zinc-400 text-sm">
          {allDisabled
            ? 'No instances are enabled for the Users tab. Configure them from the Instances tab.'
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

  const totalUsers = data.reduce((sum, i) => sum + i.users.filter(u => !u.filtered).length, 0);
  const totalFilteredUsers = data.reduce((sum, i) => sum + (i.filteredCount ?? 0), 0);

  const separatorMap = new Map(instances?.map(i => [i.id, i.entityGroupSeparator]) ?? []);
  const connectionsMap = new Map(connectionsData?.map(c => [c.instanceId, c.connections]) ?? []);
  const { totalEntities, totalFilteredEntities, totalEntitiesNoUsers, totalFilteredEntitiesNoUsers } = data.reduce(
    (acc, inst) => {
      const sep = separatorMap.get(inst.instanceId);
      const activeKeys = new Set(Object.keys(groupUsersByGroup(inst.users.filter(u => !u.filtered), sep)));
      const filteredKeys = new Set(Object.keys(groupUsersByGroup(inst.users.filter(u => u.filtered), sep)));
      const filteredOnly = [...filteredKeys].filter(k => !activeKeys.has(k)).length;
      const connections = connectionsMap.get(inst.instanceId) ?? [];
      const allEntityKeys = new Set(Object.keys(groupUsersByGroup(inst.users, sep)).map(k => k.toLowerCase()));
      const dead = connections.filter(c => !c.filtered && !allEntityKeys.has(c.name.toLowerCase())).length;
      const deadFiltered = connections.filter(c => c.filtered && !allEntityKeys.has(c.name.toLowerCase())).length;
      return {
        totalEntities: acc.totalEntities + activeKeys.size,
        totalFilteredEntities: acc.totalFilteredEntities + filteredOnly,
        totalEntitiesNoUsers: acc.totalEntitiesNoUsers + dead,
        totalFilteredEntitiesNoUsers: acc.totalFilteredEntitiesNoUsers + deadFiltered,
      };
    },
    { totalEntities: 0, totalFilteredEntities: 0, totalEntitiesNoUsers: 0, totalFilteredEntitiesNoUsers: 0 }
  );

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
          <ElapsedLabel timestampMs={dataUpdatedAt} />
        </div>
      </div>

      <DateRangePicker
        from={dateFrom}
        to={dateTo}
        onChange={(f, t) => { setDateFrom(f); setDateTo(t); }}
      />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Instances" value={data.length} onClick={() => setDrawer({
          title: 'Instances',
          rows: data.map(i => ({ primary: instances?.find(x => x.id === i.instanceId)?.name ?? i.instanceId })),
        })} />
        <StatCard label="Total Embed Users" value={totalUsers} filtered={totalFilteredUsers || undefined} onClick={() => setDrawer({
          title: 'Embed Users',
          rows: data.flatMap(inst => inst.users.filter(u => !u.filtered).map(u => ({
            primary: u.displayName || u.embedExternalId,
            secondary: instances?.find(x => x.id === inst.instanceId)?.name,
          }))),
          filteredRows: data.flatMap(inst => inst.users.filter(u => u.filtered).map(u => ({
            primary: u.displayName || u.embedExternalId,
            secondary: instances?.find(x => x.id === inst.instanceId)?.name,
          }))),
        })} />
        <StatCard label="Total Entities" value={totalEntities} filtered={totalFilteredEntities || undefined} onClick={() => setDrawer({
          title: 'Entities',
          rows: data.flatMap(inst => {
            const sep = separatorMap.get(inst.instanceId);
            const instName = instances?.find(x => x.id === inst.instanceId)?.name;
            const activeKeys = new Set(Object.keys(groupUsersByGroup(inst.users.filter(u => !u.filtered), sep)));
            return [...activeKeys].sort().map(e => ({ primary: e, secondary: instName }));
          }),
          filteredRows: data.flatMap(inst => {
            const sep = separatorMap.get(inst.instanceId);
            const instName = instances?.find(x => x.id === inst.instanceId)?.name;
            const activeKeys = new Set(Object.keys(groupUsersByGroup(inst.users.filter(u => !u.filtered), sep)));
            const filteredKeys = Object.keys(groupUsersByGroup(inst.users.filter(u => u.filtered), sep));
            return filteredKeys.filter(k => !activeKeys.has(k)).sort().map(e => ({ primary: e, secondary: instName }));
          }),
        })} />
        <StatCard label="Entities with No Users" value={totalEntitiesNoUsers} highlight={totalEntitiesNoUsers > 0} filtered={totalFilteredEntitiesNoUsers || undefined} onClick={() => setDrawer({
          title: 'Entities with No Users',
          rows: data.flatMap(inst => {
            const sep = separatorMap.get(inst.instanceId);
            const instName = instances?.find(x => x.id === inst.instanceId)?.name;
            const allEntityKeys = new Set(Object.keys(groupUsersByGroup(inst.users, sep)).map(k => k.toLowerCase()));
            const connections = connectionsMap.get(inst.instanceId) ?? [];
            return connections.filter(c => !c.filtered && !allEntityKeys.has(c.name.toLowerCase())).map(c => ({ primary: c.name, secondary: instName }));
          }),
          filteredRows: data.flatMap(inst => {
            const sep = separatorMap.get(inst.instanceId);
            const instName = instances?.find(x => x.id === inst.instanceId)?.name;
            const allEntityKeys = new Set(Object.keys(groupUsersByGroup(inst.users, sep)).map(k => k.toLowerCase()));
            const connections = connectionsMap.get(inst.instanceId) ?? [];
            return connections.filter(c => c.filtered && !allEntityKeys.has(c.name.toLowerCase())).map(c => ({ primary: c.name, secondary: instName }));
          }),
        })} />
      </div>

      {drawer && <KpiDrawer drawer={drawer} onClose={() => setDrawer(null)} />}

      <UserUsageChart data={data} />

      <input
        type="search"
        value={globalSearch}
        onChange={e => setGlobalSearch(e.target.value)}
        placeholder="Search all users across instances…"
        className="w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-blue-500/60 focus:ring-1 focus:ring-blue-500/20"
      />

      {globalSearch.trim() ? (
        <GlobalUserResults data={data} query={globalSearch.trim()} />
      ) : (
        <div className="flex flex-col gap-3">
          {data.map(inst => (
            <UserInstanceCard
              key={inst.instanceId}
              inst={inst}
              entityGroupSeparator={separatorMap.get(inst.instanceId)}
              connections={connectionsMap.get(inst.instanceId)}
              isExpanded={expanded.has(inst.instanceId)}
              onToggleExpand={() => toggleExpand(inst.instanceId)}
              search={search[inst.instanceId] ?? ''}
              onSearchChange={v => setSearch(prev => ({ ...prev, [inst.instanceId]: v }))}
            />
          ))}
        </div>
      )}
    </div>
  );
}

type UserSortField = 'name' | 'lastLogin';
type UserSortDir = 'asc' | 'desc';

function SortHeader({
  label,
  field,
  sortField,
  sortDir,
  onSort,
  className,
}: {
  label: string;
  field: UserSortField;
  sortField: UserSortField | null;
  sortDir: UserSortDir;
  onSort: (f: UserSortField) => void;
  className?: string;
}) {
  const active = sortField === field;
  return (
    <th
      className={`pb-1 pr-4 font-normal cursor-pointer select-none hover:text-zinc-300 ${active ? 'text-zinc-300' : 'text-zinc-500'} ${className ?? ''}`}
      onClick={() => onSort(field)}
    >
      {label}
      <span className="ml-1 text-zinc-600">{active ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}</span>
    </th>
  );
}

type ViewMode = 'users' | 'entities';

function UserInstanceCard({
  inst,
  entityGroupSeparator,
  connections,
  isExpanded,
  onToggleExpand,
  search,
  onSearchChange,
}: {
  inst: InstanceEmbedUserStats;
  entityGroupSeparator?: string;
  connections?: ConnectionStat[];
  isExpanded: boolean;
  onToggleExpand: () => void;
  search: string;
  onSearchChange: (v: string) => void;
}) {
  const [viewMode, setViewMode] = useState<ViewMode>('users');
  const [sortField, setSortField] = useState<UserSortField | null>(null);
  const [sortDir, setSortDir] = useState<UserSortDir>('asc');

  const handleSort = (field: UserSortField) => {
    if (sortField === field) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const groups = groupUsersByGroup(inst.users, entityGroupSeparator);
  const groupNames = Object.keys(groups).sort();
  const activeEntityCount = Object.keys(groupUsersByGroup(inst.users.filter(u => !u.filtered), entityGroupSeparator)).length;
  const filteredEntityKeys = new Set(Object.keys(groupUsersByGroup(inst.users.filter(u => u.filtered), entityGroupSeparator)));
  const filteredOnlyEntityCount = [...filteredEntityKeys].filter(k => !groups[k] || groups[k]!.every(u => u.filtered)).length;
  const q = search.trim().toLowerCase();

  const matchesSearch = (u: EmbedUserStat) =>
    !q ||
    u.displayName.toLowerCase().includes(q) ||
    u.embedExternalId.toLowerCase().includes(q) ||
    u.userName.toLowerCase().includes(q);

  // Flatten into (user, entity) rows
  const flatRows: Array<{ user: EmbedUserStat; entity: string }> = [];
  for (const g of groupNames) {
    for (const u of groups[g]!) {
      flatRows.push({ user: u, entity: g });
    }
  }

  if (sortField) {
    flatRows.sort((a, b) => {
      let cmp = 0;
      if (sortField === 'name') {
        cmp = a.user.displayName.localeCompare(b.user.displayName);
      } else {
        const ta = a.user.lastLogin ? new Date(a.user.lastLogin).getTime() : 0;
        const tb = b.user.lastLogin ? new Date(b.user.lastLogin).getTime() : 0;
        cmp = ta - tb;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }

  // Entity rows: all users counted, filtered ones tracked for dimming
  const entityKeySet = new Set(groupNames.map(n => n.toLowerCase()));
  const deadConnections = (connections ?? []).filter(
    c => !c.filtered && !entityKeySet.has(c.name.toLowerCase())
  );
  const entityRows = [
    ...groupNames.map(name => {
      const all = groups[name]!;
      const allFiltered = all.every(u => u.filtered);
      const loggedIn = all.filter(u => u.lastLogin !== null).length;
      const neverLogged = all.filter(u => u.lastLogin === null).length;
      return { name, total: all.length, loggedIn, neverLogged, allFiltered, dead: false };
    }),
    ...deadConnections.map(c => ({ name: c.name, total: 0, loggedIn: 0, neverLogged: 0, allFiltered: false, dead: true })),
  ]
    .filter(e => q ? e.name.toLowerCase().includes(q) : true)
    .sort((a, b) => b.total - a.total);

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900">
      <button
        className="w-full flex items-center justify-between gap-2 p-4 text-left hover:bg-zinc-800/40 transition-colors rounded-t-lg"
        onClick={onToggleExpand}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-zinc-400 text-xs w-3">{isExpanded ? '▾' : '▸'}</span>
          <span className="text-zinc-100 font-medium truncate">{inst.instanceLabel}</span>
          <span className="text-xs px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 capitalize shrink-0">
            {inst.instanceRole}
          </span>
        </div>
        <div className="flex items-center gap-4 shrink-0 text-xs leading-none">
          {inst.error ? (
            <span className="text-red-400">error</span>
          ) : (
            <>
              <span className="text-zinc-400 whitespace-nowrap">
                <span className="text-zinc-200 font-medium">{inst.users.length - (inst.filteredCount ?? 0)}</span>
                {(inst.filteredCount ?? 0) > 0 && (
                  <span className="text-zinc-600"> ({inst.filteredCount} filtered)</span>
                )}
                {' '}user{(inst.users.length - (inst.filteredCount ?? 0)) !== 1 ? 's' : ''}
              </span>
              <span className="text-zinc-600 whitespace-nowrap">
                {activeEntityCount} {activeEntityCount !== 1 ? 'entities' : 'entity'}
                {filteredOnlyEntityCount > 0 && <span className="text-zinc-700"> ({filteredOnlyEntityCount} filtered)</span>}
              </span>
              {deadConnections.length > 0 && (
                <span className="text-amber-500/70 whitespace-nowrap">{deadConnections.length} with no users</span>
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
                  placeholder={viewMode === 'users' ? 'Search users…' : 'Search entities…'}
                  className="flex-1 bg-zinc-950 border border-zinc-700 rounded px-3 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-blue-500/60 focus:ring-1 focus:ring-blue-500/20"
                />
                <div className="flex shrink-0 rounded border border-zinc-700 overflow-hidden text-xs">
                  <button
                    onClick={() => setViewMode('users')}
                    className={`px-2.5 py-1.5 transition-colors ${viewMode === 'users' ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'}`}
                  >
                    users
                  </button>
                  <button
                    onClick={() => setViewMode('entities')}
                    className={`px-2.5 py-1.5 border-l border-zinc-700 transition-colors ${viewMode === 'entities' ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'}`}
                  >
                    entities
                  </button>
                </div>
              </div>

              {viewMode === 'entities' ? (
                <table key="entities" className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-zinc-800 text-zinc-500 text-left">
                      <th className="pb-1 pr-4 font-normal">Entity</th>
                      <th className="pb-1 pr-4 font-normal text-right">Users</th>
                      <th className="pb-1 pr-4 font-normal text-right">Logged in</th>
                      <th className="pb-1 font-normal text-right">Never logged in</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entityRows.map(e => {
                      const dim = e.dead ? 'opacity-35' : e.allFiltered ? 'opacity-40 italic' : '';
                      return (
                        <tr key={e.name} className={`border-b border-zinc-800/50 last:border-0 ${dim}`}>
                          <td className="py-1.5 pr-4 text-zinc-300">{e.name}</td>
                          <td className="py-1.5 pr-4 text-right">
                            {e.dead
                              ? <span className="text-zinc-600">0</span>
                              : <span className="text-zinc-200 font-medium">{e.total}</span>}
                          </td>
                          <td className="py-1.5 pr-4 text-right">
                            <span className={e.loggedIn > 0 ? 'text-emerald-400' : 'text-zinc-600'}>{e.loggedIn}</span>
                          </td>
                          <td className="py-1.5 text-right">
                            <span className={!e.dead && e.neverLogged > 0 ? 'text-amber-400' : 'text-zinc-600'}>{e.neverLogged}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
              <table key="users" className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-500 text-left">
                    <SortHeader label="Display Name" field="name" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                    <th className="pb-1 pr-4 font-normal text-zinc-500">Entity</th>
                    <th className="pb-1 pr-4 font-normal text-zinc-500">External ID</th>
                    <th className="pb-1 pr-4 font-normal text-zinc-500">Status</th>
                    <SortHeader label="Last Login" field="lastLogin" sortField={sortField} sortDir={sortDir} onSort={handleSort} className="pr-0" />
                  </tr>
                </thead>
                <tbody>
                  {(q ? flatRows.filter(({ user: u }) => matchesSearch(u)) : flatRows).map(({ user: u, entity }) => {
                    const dim = u.filtered ? 'opacity-50 italic' : '';
                    return (
                      <tr
                        key={`${u.id}:${entity}`}
                        className={`border-b border-zinc-800/50 last:border-0 transition-opacity ${dim}`}
                      >
                        <td className="py-1.5 pr-4 text-zinc-300">{u.displayName}</td>
                        <td className="py-1.5 pr-4 text-zinc-500">{entity}</td>
                        <td className="py-1.5 pr-4 text-zinc-400 font-mono">{u.embedExternalId || '—'}</td>
                        <td className="py-1.5 pr-4">
                          {u.active
                            ? <span className="text-emerald-400">active</span>
                            : <span className="text-zinc-600">inactive</span>}
                        </td>
                        <td className="py-1.5 text-zinc-500">{timeAgoSimple(u.lastLogin)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function groupUsersByGroup(users: EmbedUserStat[], separator?: string): Record<string, EmbedUserStat[]> {
  const out: Record<string, EmbedUserStat[]> = {};
  const seen: Record<string, Set<string>> = {};
  const toKey = (display: string) =>
    separator ? display.split(separator)[0]!.trim() : display;
  for (const u of users) {
    const relevantGroups = u.groups.filter(g => g.display !== ALL_EMBED_USERS_GROUP);
    if (relevantGroups.length === 0) {
      const key = '(No Group)';
      (out[key] ??= []).push(u);
    } else {
      for (const g of relevantGroups) {
        const key = toKey(g.display);
        (seen[key] ??= new Set());
        if (!seen[key]!.has(u.id)) {
          seen[key]!.add(u.id);
          (out[key] ??= []).push(u);
        }
      }
    }
  }
  return out;
}


// --- Global search results ---

function GlobalConnectionResults({
  data,
  excluded,
  query,
  onToggleExclude,
}: {
  data: InstanceDashboardStats[];
  excluded: Record<string, Set<string>>;
  query: string;
  onToggleExclude: (instanceId: string, connectionId: string) => void;
}) {
  const q = query.toLowerCase();
  const rows = data.flatMap(inst =>
    inst.connections
      .filter(c =>
        c.name.toLowerCase().includes(q) ||
        c.database.toLowerCase().includes(q) ||
        c.dialect.toLowerCase().includes(q)
      )
      .map(c => ({ ...c, instanceId: inst.instanceId, instanceLabel: inst.instanceLabel }))
  );

  return (
    <table className="w-full text-xs border-collapse">
      <thead>
        <tr className="border-b border-zinc-800 text-zinc-500 text-left">
          <th className="pb-1 pr-4 font-normal">Instance</th>
          <th className="pb-1 pr-4 font-normal">Name</th>
          <th className="pb-1 pr-4 font-normal">Database</th>
          <th className="pb-1 pr-4 font-normal">Dialect</th>
          <th className="pb-1 pr-4 font-normal">Schema Model</th>
          <th className="pb-1 font-normal text-right">Exclude</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(c => {
          const isExcluded = (excluded[c.instanceId] ?? new Set()).has(c.id);
          const dimClass = isExcluded ? 'opacity-30' : c.filtered ? 'opacity-50 italic' : '';
          return (
            <tr key={`${c.instanceId}:${c.id}`} className={`border-b border-zinc-800/50 last:border-0 transition-opacity ${dimClass}`}>
              <td className="py-1.5 pr-4 text-zinc-500">{c.instanceLabel}</td>
              <td className="py-1.5 pr-4 text-zinc-300">{c.name}</td>
              <td className="py-1.5 pr-4 text-zinc-400">{c.database}</td>
              <td className="py-1.5 pr-4 text-zinc-400">{c.dialect}</td>
              <td className="py-1.5 pr-4">
                {c.hasSchemaModel
                  ? <span className="text-emerald-400">✓</span>
                  : <span className="text-amber-400">missing</span>}
              </td>
              <td className="py-1.5 text-right">
                <button
                  onClick={() => onToggleExclude(c.instanceId, c.id)}
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

function GlobalUserResults({
  data,
  query,
}: {
  data: InstanceEmbedUserStats[];
  query: string;
}) {
  const q = query.toLowerCase();
  const rows = data.flatMap(inst =>
    inst.users
      .filter(u =>
        u.displayName.toLowerCase().includes(q) ||
        u.embedExternalId.toLowerCase().includes(q) ||
        u.userName.toLowerCase().includes(q)
      )
      .map(u => ({ ...u, instanceLabel: inst.instanceLabel }))
  );

  if (rows.length === 0) return <p className="text-xs text-zinc-500">No users match.</p>;

  return (
    <table className="w-full text-xs border-collapse">
      <thead>
        <tr className="border-b border-zinc-800 text-zinc-500 text-left">
          <th className="pb-1 pr-4 font-normal">Instance</th>
          <th className="pb-1 pr-4 font-normal">Display Name</th>
          <th className="pb-1 pr-4 font-normal">External ID</th>
          <th className="pb-1 pr-4 font-normal">Status</th>
          <th className="pb-1 font-normal">Last Login</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(u => (
          <tr key={`${u.instanceLabel}:${u.id}`} className="border-b border-zinc-800/50 last:border-0">
            <td className="py-1.5 pr-4 text-zinc-500">{u.instanceLabel}</td>
            <td className="py-1.5 pr-4 text-zinc-300">{u.displayName}</td>
            <td className="py-1.5 pr-4 text-zinc-400 font-mono">{u.embedExternalId || '—'}</td>
            <td className="py-1.5 pr-4">
              {u.active
                ? <span className="text-emerald-400">active</span>
                : <span className="text-zinc-600">inactive</span>}
            </td>
            <td className="py-1.5 text-zinc-500">{timeAgoSimple(u.lastLogin)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// --- Usage chart ---

function computeWeeklyLogins(users: EmbedUserStat[]): { label: string; count: number }[] {
  const now = new Date();
  const msDay = 86_400_000;
  const msWeek = 7 * msDay;
  // Align to Monday of current week
  const dayOfWeek = (now.getDay() + 6) % 7; // Mon=0 ... Sun=6
  const currentMonday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek);
  return Array.from({ length: 12 }, (_, i) => {
    const start = new Date(currentMonday.getTime() - (11 - i) * msWeek);
    const end = new Date(start.getTime() + msWeek);
    return {
      label: `${start.getMonth() + 1}/${start.getDate()}`,
      count: users.filter(u => {
        if (!u.lastLogin) return false;
        const t = new Date(u.lastLogin).getTime();
        return t >= start.getTime() && t < end.getTime();
      }).length,
    };
  });
}

function trimLeadingZeros(data: { label: string; count: number }[]): { label: string; count: number }[] {
  const firstNonZero = data.findIndex(d => d.count > 0);
  if (firstNonZero <= 0) return data;
  return data.slice(Math.max(0, firstNonZero - 1));
}

function computeMonthlySignups(users: EmbedUserStat[]): { label: string; count: number }[] {
  const now = new Date();
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1);
    return {
      label: d.toLocaleString('default', { month: 'short' }),
      count: users.filter(u => {
        if (!u.createdAt) return false;
        const cd = new Date(u.createdAt);
        return cd.getFullYear() === d.getFullYear() && cd.getMonth() === d.getMonth();
      }).length,
    };
  });
}

function UsageBarChart({ data, color }: { data: { label: string; count: number }[]; color: string }) {
  return (
    <ResponsiveContainer width="100%" height={140}>
      <ReBarChart data={data} margin={{ top: 20, right: 4, bottom: 0, left: 4 }} barCategoryGap="30%">
        <CartesianGrid vertical={false} stroke="#27272a" />
        <XAxis
          dataKey="label"
          tick={{ fill: '#71717a', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          interval={0}
        />
        <YAxis hide />
        <Tooltip
          cursor={{ fill: 'rgba(255,255,255,0.04)' }}
          contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 6, fontSize: 12, color: '#e4e4e7' }}
          itemStyle={{ color: '#e4e4e7' }}
          labelStyle={{ color: '#a1a1aa', marginBottom: 2 }}
        />
        <Bar dataKey="count" fill={color} radius={[3, 3, 0, 0]} name="Users">
          <LabelList dataKey="count" position="top" style={{ fill: '#a1a1aa', fontSize: 11 }} formatter={(v: unknown) => (v as number) === 0 ? '' : (v as number)} />
        </Bar>
      </ReBarChart>
    </ResponsiveContainer>
  );
}

function MiniStat({ label, value, total, warn }: { label: string; value: number; total: number; warn?: boolean }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className={`bg-zinc-950/60 rounded p-3 ${warn ? 'border-l-2 border-amber-500/50' : ''}`}>
      <div className={`text-xl font-bold ${warn ? 'text-amber-400' : 'text-zinc-100'}`}>{value}</div>
      <div className="text-xs text-zinc-500 mt-0.5">{label}</div>
      {total > 0 && <div className="text-xs text-zinc-700">{pct}%</div>}
    </div>
  );
}

const UserUsageChart = memo(function UserUsageChart({ data }: { data: InstanceEmbedUserStats[] }) {
  const allUsers = data.flatMap(d => d.users);
  const now = Date.now();
  const msDay = 86_400_000;
  const active7 = allUsers.filter(u => u.lastLogin && now - new Date(u.lastLogin).getTime() < 7 * msDay).length;
  const active30 = allUsers.filter(u => u.lastLogin && now - new Date(u.lastLogin).getTime() < 30 * msDay).length;
  const active90 = allUsers.filter(u => u.lastLogin && now - new Date(u.lastLogin).getTime() < 90 * msDay).length;
  const neverLogged = allUsers.filter(u => !u.lastLogin).length;
  const weeklyLogins = trimLeadingZeros(computeWeeklyLogins(allUsers));
  const monthlySignups = trimLeadingZeros(computeMonthlySignups(allUsers));

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 flex flex-col gap-4">
      <h3 className="text-sm font-medium text-zinc-300">Usage Analytics</h3>
      <div className="grid grid-cols-4 gap-2">
        <MiniStat label="Active 7d" value={active7} total={allUsers.length} />
        <MiniStat label="Active 30d" value={active30} total={allUsers.length} />
        <MiniStat label="Active 90d" value={active90} total={allUsers.length} />
        <MiniStat label="Never logged in" value={neverLogged} total={allUsers.length} warn={neverLogged > 0} />
      </div>
      <div className="grid grid-cols-2 gap-6">
        <div>
          <p className="text-xs text-zinc-600 mb-1">Logins per week — last {weeklyLogins.length} weeks</p>
          <UsageBarChart data={weeklyLogins} color="#3b82f6" />
        </div>
        <div>
          <p className="text-xs text-zinc-600 mb-1">New users per month — last {monthlySignups.length} months</p>
          <UsageBarChart data={monthlySignups} color="#10b981" />
        </div>
      </div>
    </div>
  );
});

// --- KPI Drawer ---

type DrawerRow = { primary: string; secondary?: string };
type DrawerData = { title: string; rows: DrawerRow[]; filteredRows?: DrawerRow[] };

function DrawerSection({ label, rows, dimmed }: { label: string; rows: DrawerRow[]; dimmed?: boolean }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const copy = (e: React.MouseEvent) => {
    e.stopPropagation();
    const text = rows.map(r => r.secondary ? `${r.primary}\t${r.secondary}` : r.primary).join('\n');
    navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
  };
  return (
    <div className="border-b border-zinc-800">
      <button
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-zinc-800/50 transition-colors text-left"
        onClick={() => setOpen(v => !v)}
      >
        <span className={`text-xs font-medium uppercase tracking-wider ${dimmed ? 'text-zinc-500' : 'text-zinc-300'}`}>{label}</span>
        <div className="flex items-center gap-2">
          <span
            className="text-zinc-500 hover:text-zinc-300 text-xs px-1.5 py-0.5 rounded hover:bg-zinc-700 transition-colors"
            onClick={copy}
          >{copied ? 'copied!' : 'copy'}</span>
          <span className="text-zinc-500 text-xs">{open ? '▲' : '▼'}</span>
        </div>
      </button>
      {open && (
        <div className={`divide-y divide-zinc-800/60 ${dimmed ? 'opacity-50' : ''}`}>
          {rows.map((row, i) => (
            <div key={i} className="px-4 py-2.5">
              <div className={`text-sm ${dimmed ? 'text-zinc-400 italic' : 'text-zinc-200'}`}>{row.primary}</div>
              {row.secondary && <div className="text-xs text-zinc-500 mt-0.5">{row.secondary}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function KpiDrawer({ drawer, onClose }: { drawer: DrawerData; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div className="relative w-full max-w-md bg-zinc-900 border-l border-zinc-800 flex flex-col h-full shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
          <span className="text-sm font-medium text-zinc-200">{drawer.title}</span>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200 text-lg leading-none">✕</button>
        </div>
        <div className="overflow-y-auto flex-1">
          <DrawerSection label={`Active (${drawer.rows.length})`} rows={drawer.rows} />
          {!!drawer.filteredRows?.length && (
            <DrawerSection label={`Filtered out (${drawer.filteredRows.length})`} rows={drawer.filteredRows} dimmed />
          )}
        </div>
      </div>
    </div>
  );
}

// --- Sub-components ---

function StatCard({ label, value, highlight, filtered, onClick }: { label: string; value: number; highlight?: boolean; filtered?: number; onClick?: () => void }) {
  return (
    <div
      className={`rounded-lg border border-zinc-800 bg-zinc-900 p-4 border-t-2 ${highlight ? 'border-t-amber-500/70' : 'border-t-blue-500/30'} ${onClick ? 'cursor-pointer hover:bg-zinc-800/60 transition-colors' : ''}`}
      onClick={onClick}
    >
      <div className={`text-2xl font-bold ${highlight ? 'text-amber-400' : 'text-zinc-100'}`}>
        {value}
      </div>
      <div className="text-xs text-zinc-400 mt-1">{label}</div>
      {!!filtered && <div className="text-xs text-zinc-600 mt-0.5">{filtered} filtered out</div>}
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

  const activeConnections = inst.connections.filter(c => !excludedIds.has(c.id) && !c.filtered);
  const missing = activeConnections.filter(c => !c.hasSchemaModel);
  const excludedCount = inst.connections.filter(c => !c.filtered).length - activeConnections.length;

  const filtered = inst.connections.slice().sort((a, b) => (a.hasSchemaModel ? 1 : 0) - (b.hasSchemaModel ? 1 : 0));

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
        className="w-full flex items-center justify-between gap-2 p-4 text-left hover:bg-zinc-800/40 transition-colors rounded-t-lg"
        onClick={onToggleExpand}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-zinc-400 text-xs w-3">{isExpanded ? '▾' : '▸'}</span>
          <span className="text-zinc-100 font-medium truncate">{inst.instanceLabel}</span>
          <span className="text-xs px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 capitalize shrink-0">
            {inst.instanceRole}
          </span>
          {!inst.error && missing.length > 0 && (
            <span className="text-xs text-amber-400 shrink-0">{missing.length} missing schema</span>
          )}
        </div>

        <div className="flex items-center shrink-0 text-xs">
          {inst.error ? (
            <span className="text-red-400 w-56 text-right">error</span>
          ) : (
            <span className="text-zinc-400 w-56 text-right whitespace-nowrap">
              <span className="text-zinc-200 font-medium">{activeConnections.length}</span>
              {excludedCount > 0 && (
                <span className="text-zinc-600"> ({excludedCount} excl.)</span>
              )}
              {(inst.filteredCount ?? 0) > 0 && (
                <span className="text-zinc-600"> ({inst.filteredCount} filtered)</span>
              )}
              {' '}connection{activeConnections.length !== 1 ? 's' : ''}
            </span>
          )}
          <span className="text-zinc-600 w-44 text-right">{new URL(inst.baseUrl).hostname}</span>
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
                  className="flex-1 bg-zinc-950 border border-zinc-700 rounded px-3 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-blue-500/60 focus:ring-1 focus:ring-blue-500/20"
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
              <ConnectionTable
                connections={filtered}
                excludedIds={excludedIds}
                onToggleExclude={onToggleExclude}
                refreshStatus={refreshStatus}
                refreshError={refreshError}
                onRefresh={refreshOne}
                searchQuery={search}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}

function timeAgoSimple(isoOrNull: string | null | undefined): string {
  if (!isoOrNull) return 'never';
  const diffMs = Date.now() - new Date(isoOrNull).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
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
  searchQuery,
}: {
  connections: ConnectionStat[];
  excludedIds: Set<string>;
  onToggleExclude: (id: string) => void;
  refreshStatus: Record<string, RefreshStatus>;
  refreshError: Record<string, string>;
  onRefresh: (c: ConnectionStat) => void;
  searchQuery?: string;
}) {
  const q = searchQuery?.trim().toLowerCase() ?? '';

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
        {connections.filter(c => !q ||
            c.name.toLowerCase().includes(q) ||
            c.database.toLowerCase().includes(q) ||
            c.dialect.toLowerCase().includes(q)
          ).map(c => {
          const isExcluded = excludedIds.has(c.id);
          const status = refreshStatus[c.id] ?? 'idle';
          const errMsg = refreshError[c.id];
          const dimClass = isExcluded ? 'opacity-30' : c.filtered ? 'opacity-50 italic' : '';
          return (
            <tr
              key={c.id}
              className={`border-b border-zinc-800/50 last:border-0 transition-opacity ${dimClass}`}
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
