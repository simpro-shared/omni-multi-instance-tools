import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { Instance, InstancePublic, InstanceRole } from '../../shared/types';

const blank: Omit<Instance, 'id'> = {
  label: '',
  role: 'destination',
  baseUrl: '',
  apiKey: '',
  userId: '',
  modelId: '',
  folderId: '',
  folderPath: '',
};

export default function Instances() {
  const qc = useQueryClient();
  const { data: instances } = useQuery({ queryKey: ['instances'], queryFn: api.listInstances });
  const [form, setForm] = useState<Omit<Instance, 'id'> & { id?: string }>(blank);

  const toggleDash = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      api.setInstanceDashboardEnabled(id, enabled),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['instances'] }),
  });
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
    });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <section>
        <h2 className="text-lg font-medium mb-3">Instances</h2>
        <div className="space-y-2">
          {instances?.map(i => (
            <div key={i.id} className="bg-zinc-900 border border-zinc-800 rounded p-3 flex items-center gap-3 text-sm">
              <span className={`text-xs px-2 py-0.5 rounded ${i.role === 'source' ? 'bg-emerald-900 text-emerald-200' : 'bg-blue-900 text-blue-200'}`}>
                {i.role}
              </span>
              <div className="flex-1">
                <div className="text-zinc-100">{i.label}</div>
                <div className="text-zinc-500 text-xs">{i.baseUrl} · key {i.apiKeyMasked}</div>
              </div>
              <button
                className={`text-xs ${i.dashboardEnabled !== false ? 'text-emerald-400 hover:text-emerald-300' : 'text-zinc-600 hover:text-zinc-400'}`}
                title={i.dashboardEnabled !== false ? 'Showing on Dashboard — click to hide' : 'Hidden from Dashboard — click to show'}
                onClick={() => toggleDash.mutate({ id: i.id, enabled: i.dashboardEnabled === false })}
              >
                {i.dashboardEnabled !== false ? 'dashboard ✓' : 'dashboard ✗'}
              </button>
              <button className="text-xs text-zinc-400 hover:text-zinc-100" onClick={() => startEdit(i)}>edit</button>
              <button
                className="text-xs text-red-400 hover:text-red-300"
                onClick={() => { if (confirm(`Delete ${i.label}?`)) del.mutate(i.id); }}
              >
                delete
              </button>
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
