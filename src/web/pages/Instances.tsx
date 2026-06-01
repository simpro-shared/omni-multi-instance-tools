import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { DashboardFilter, Instance, InstancePublic, InstanceRole } from '../../shared/types';

type DashboardTab = 'connections' | 'users';

function tabEnabled(inst: InstancePublic, tab: DashboardTab): boolean {
  if (!inst.dashboardTabs) return true;
  return inst.dashboardTabs.includes(tab);
}

const blank: Omit<Instance, 'id'> = {
  label: '',
  role: 'destination',
  baseUrl: '',
  apiKey: '',
  userId: '',
  modelId: '',
  folderId: '',
  folderPath: '',
  entityGroupSeparator: '',
};

export default function Instances() {
  const qc = useQueryClient();
  const { data: instances } = useQuery({ queryKey: ['instances'], queryFn: api.listInstances });
  const [form, setForm] = useState<Omit<Instance, 'id'> & { id?: string }>(blank);

  const setTabs = useMutation({
    mutationFn: ({ id, tabs }: { id: string; tabs: DashboardTab[] }) =>
      api.setInstanceDashboardTabs(id, tabs),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['instances'] }),
  });

  const toggleTab = (inst: InstancePublic, tab: DashboardTab) => {
    const current = inst.dashboardTabs ?? ['connections', 'users'];
    const next = tabEnabled(inst, tab)
      ? current.filter(t => t !== tab)
      : [...new Set([...current, tab])];
    setTabs.mutate({ id: inst.id, tabs: next });
  };
  const saveFilter = useMutation({
    mutationFn: ({ id, filter }: { id: string; filter: DashboardFilter }) =>
      api.setInstanceDashboardFilter(id, filter),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dashboard-stats'] });
      qc.invalidateQueries({ queryKey: ['dashboard-embed-users'] });
    },
  });
  const saveFilterFor = (id: string, filter: DashboardFilter) =>
    saveFilter.mutateAsync({ id, filter });
  const create = useMutation({
    mutationFn: (b: Omit<Instance, 'id'>) => api.createInstance(b),
    onSuccess: () => {
      setForm(blank);
      qc.invalidateQueries({ queryKey: ['instances'] });
    },
  });
  const update = useMutation({
    mutationFn: ({ id, b }: { id: string; b: Omit<Instance, 'id'> }) => api.updateInstance(id, b),
    onSuccess: () => {
      setForm(blank);
      qc.invalidateQueries({ queryKey: ['instances'] });
    },
  });
  const del = useMutation({
    mutationFn: (id: string) => api.deleteInstance(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['instances'] }),
  });

  const submit = (): void => {
    const { id, ...body } = form;
    if (id) update.mutate({ id, b: body });
    else create.mutate(body);
  };

  const startEdit = (i: InstancePublic): void => {
    setForm({
      id: i.id,
      label: i.label,
      role: i.role,
      baseUrl: i.baseUrl,
      apiKey: '',
      userId: i.userId,
      modelId: i.modelId,
      folderId: i.folderId,
      folderPath: i.folderPath,
      entityGroupSeparator: i.entityGroupSeparator ?? '',
    });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <section>
        <h2 className="text-lg font-medium mb-3">Instances</h2>
        <div className="space-y-2">
          {instances?.map(i => (
            <div key={i.id} className="bg-zinc-900 border border-zinc-800 rounded text-sm">
              <div className="p-3 flex items-center gap-3">
                <span className={`text-xs px-2 py-0.5 rounded ${i.role === 'source' ? 'bg-emerald-900 text-emerald-200' : 'bg-blue-900 text-blue-200'}`}>
                  {i.role}
                </span>
                <div className="flex-1">
                  <div className="text-zinc-100">{i.label}</div>
                  <div className="text-zinc-500 text-xs">{i.baseUrl} · key {i.apiKeyMasked}</div>
                </div>
                <div className="flex items-center gap-1">
                  {(['connections', 'users'] as DashboardTab[]).map(tab => {
                    const on = tabEnabled(i, tab);
                    return (
                      <button
                        key={tab}
                        onClick={() => toggleTab(i, tab)}
                        title={on ? `Hide from ${tab} tab` : `Show in ${tab} tab`}
                        className={`text-xs px-1.5 py-0.5 rounded border transition-colors ${
                          on
                            ? 'border-emerald-800 text-emerald-400 hover:border-emerald-600'
                            : 'border-zinc-800 text-zinc-600 hover:text-zinc-400'
                        }`}
                      >
                        {tab[0]!.toUpperCase()}
                      </button>
                    );
                  })}
                </div>
                <button className="text-xs text-zinc-400 hover:text-zinc-100" onClick={() => startEdit(i)}>edit</button>
                <button
                  className="text-xs text-red-400 hover:text-red-300"
                  onClick={() => { if (confirm(`Delete ${i.label}?`)) del.mutate(i.id); }}
                >
                  delete
                </button>
              </div>
              <FilterEditor
                instance={i}
                onSave={filter => saveFilterFor(i.id, filter)}
              />
            </div>
          ))}
          {instances && instances.length === 0 && (
            <div className="text-sm text-zinc-500">No instances yet. Add one →</div>
          )}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-medium mb-3">{form.id ? 'Edit instance' : 'Add instance'}</h2>
        <div className="bg-zinc-900 border border-zinc-800 rounded p-4 space-y-3 text-sm">
          <Field label="Label" value={form.label} onChange={v => setForm({ ...form, label: v })} />
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Role</label>
            <select
              value={form.role}
              onChange={e => setForm({ ...form, role: e.target.value as InstanceRole })}
              className="w-full bg-zinc-950 border border-zinc-700 rounded px-2 py-1.5"
            >
              <option value="source">source</option>
              <option value="destination">destination</option>
            </select>
          </div>
          <Field label="Base URL" value={form.baseUrl} onChange={v => setForm({ ...form, baseUrl: v })} placeholder="https://acme.omniapp.co" />
          <Field
            label={form.id ? 'API Key (leave blank to keep existing)' : 'API Key'}
            value={form.apiKey}
            onChange={v => setForm({ ...form, apiKey: v })}
            type="password"
          />
          <Field label="User ID" value={form.userId} onChange={v => setForm({ ...form, userId: v })} />
          <Field label="Base Model ID (for import)" value={form.modelId} onChange={v => setForm({ ...form, modelId: v })} />
          <Field label="Folder ID (for list / delete)" value={form.folderId} onChange={v => setForm({ ...form, folderId: v })} />
          <Field label="Folder Path (for import target)" value={form.folderPath} onChange={v => setForm({ ...form, folderPath: v })} placeholder="Marketing/Imported" />
          <Field label="Entity group separator (optional)" value={form.entityGroupSeparator ?? ''} onChange={v => setForm({ ...form, entityGroupSeparator: v || undefined })} placeholder="e.g.  | " />
          <div className="flex gap-2 pt-2">
            <button
              className="bg-zinc-100 text-zinc-900 rounded px-4 py-1.5 font-medium disabled:opacity-40"
              disabled={!form.label || !form.baseUrl || (!form.id && !form.apiKey)}
              onClick={submit}
            >
              {form.id ? 'Save' : 'Create'}
            </button>
            {form.id && (
              <button className="text-xs text-zinc-400" onClick={() => setForm(blank)}>
                cancel
              </button>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

type MatchMode = 'contains' | 'exact';
type FilterPattern = { value: string; mode: MatchMode };

function parsePatterns(input: string, mode: MatchMode): FilterPattern[] {
  return input.split(',').map(s => s.trim()).filter(Boolean).map(value => ({ value, mode }));
}

function initPatterns(contains: string[] = [], exact: string[] = []): FilterPattern[] {
  return [
    ...contains.map(value => ({ value, mode: 'contains' as MatchMode })),
    ...exact.map(value => ({ value, mode: 'exact' as MatchMode })),
  ];
}

function PatternChips({
  patterns,
  onChange,
}: {
  patterns: FilterPattern[];
  onChange: (p: FilterPattern[]) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {patterns.map((p, i) => (
        <span key={`${p.mode}:${p.value}`} className="flex items-center gap-1 bg-zinc-800 text-zinc-300 rounded px-1.5 py-0.5">
          <button
            title={p.mode === 'contains' ? 'Switch to exact match' : 'Switch to contains match'}
            onClick={() => onChange(patterns.map((x, j) => j === i ? { ...x, mode: x.mode === 'contains' ? 'exact' : 'contains' } : x))}
            className={`font-mono text-[10px] px-0.5 rounded ${p.mode === 'contains' ? 'text-zinc-500 hover:text-zinc-300' : 'text-blue-400 hover:text-blue-300'}`}
          >
            {p.mode === 'contains' ? '~' : '='}
          </button>
          {p.value}
          <button onClick={() => onChange(patterns.filter((_, j) => j !== i))} className="text-zinc-500 hover:text-zinc-200">×</button>
        </span>
      ))}
    </div>
  );
}

function FilterEditor({
  instance,
  onSave,
}: {
  instance: InstancePublic;
  onSave: (filter: DashboardFilter) => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const [dbPatterns, setDbPatterns] = useState<FilterPattern[]>(() =>
    initPatterns(instance.dashboardFilter?.databaseContains, instance.dashboardFilter?.databaseExact)
  );
  const [idPatterns, setIdPatterns] = useState<FilterPattern[]>(() =>
    initPatterns(instance.dashboardFilter?.externalIdContains, instance.dashboardFilter?.externalIdExact)
  );
  const [dbInput, setDbInput] = useState('');
  const [dbMode, setDbMode] = useState<MatchMode>('contains');
  const [idInput, setIdInput] = useState('');
  const [idMode, setIdMode] = useState<MatchMode>('contains');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (savedTimer.current) clearTimeout(savedTimer.current); }, []);

  const totalPatterns = dbPatterns.length + idPatterns.length;

  const addDb = () => {
    const incoming = parsePatterns(dbInput, dbMode);
    if (incoming.length) setDbPatterns(p => [...p, ...incoming.filter(v => !p.some(x => x.value === v.value && x.mode === v.mode))]);
    setDbInput('');
  };
  const addId = () => {
    const incoming = parsePatterns(idInput, idMode);
    if (incoming.length) setIdPatterns(p => [...p, ...incoming.filter(v => !p.some(x => x.value === v.value && x.mode === v.mode))]);
    setIdInput('');
  };

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await onSave({
        databaseContains: dbPatterns.filter(p => p.mode === 'contains').map(p => p.value),
        databaseExact: dbPatterns.filter(p => p.mode === 'exact').map(p => p.value),
        externalIdContains: idPatterns.filter(p => p.mode === 'contains').map(p => p.value),
        externalIdExact: idPatterns.filter(p => p.mode === 'exact').map(p => p.value),
      });
      setSaved(true);
      savedTimer.current = setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  };

  const ModeToggle = ({ mode, onChange }: { mode: MatchMode; onChange: (m: MatchMode) => void }) => (
    <button
      type="button"
      title={mode === 'contains' ? 'Contains match — click for exact' : 'Exact match — click for contains'}
      onClick={() => onChange(mode === 'contains' ? 'exact' : 'contains')}
      className={`shrink-0 px-2 py-1 rounded border text-[10px] font-mono transition-colors ${
        mode === 'contains'
          ? 'border-zinc-700 text-zinc-500 hover:border-zinc-500 hover:text-zinc-300'
          : 'border-blue-700 text-blue-400 hover:border-blue-500'
      }`}
    >
      {mode === 'contains' ? '~contains' : '=exact'}
    </button>
  );

  return (
    <div className="border-t border-zinc-800">
      <button
        className="w-full text-left text-xs text-zinc-500 hover:text-zinc-300 px-3 py-1.5 flex items-center gap-1"
        onClick={() => setOpen(o => !o)}
      >
        <span>{open ? '▾' : '▸'}</span>
        <span>skip filters</span>
        {totalPatterns > 0 && <span className="text-zinc-600">({totalPatterns} active)</span>}
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-3 text-xs">
          <div>
            <div className="text-zinc-500 mb-1">Connections — skip if database matches</div>
            <div className="flex gap-1 mb-1">
              <ModeToggle mode={dbMode} onChange={setDbMode} />
              <input
                value={dbInput}
                onChange={e => setDbInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addDb()}
                placeholder="e.g. internal_, test_ (comma-separated)"
                className="flex-1 bg-zinc-950 border border-zinc-700 rounded px-2 py-1 text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500"
              />
              <button onClick={addDb} className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 rounded text-zinc-300">add</button>
            </div>
            <PatternChips patterns={dbPatterns} onChange={setDbPatterns} />
          </div>
          <div>
            <div className="text-zinc-500 mb-1">Users — skip if external ID matches</div>
            <div className="flex gap-1 mb-1">
              <ModeToggle mode={idMode} onChange={setIdMode} />
              <input
                value={idInput}
                onChange={e => setIdInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addId()}
                placeholder="e.g. test-, embed_ (comma-separated)"
                className="flex-1 bg-zinc-950 border border-zinc-700 rounded px-2 py-1 text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500"
              />
              <button onClick={addId} className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 rounded text-zinc-300">add</button>
            </div>
            <PatternChips patterns={idPatterns} onChange={setIdPatterns} />
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-3 py-1 bg-zinc-100 text-zinc-900 rounded font-medium disabled:opacity-40"
            >
              {saving ? 'saving…' : 'Update filter'}
            </button>
            {saved && <span className="text-emerald-400">Saved</span>}
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, onChange, type = 'text', placeholder }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs text-zinc-400 mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-zinc-950 border border-zinc-700 rounded px-2 py-1.5"
      />
    </div>
  );
}
