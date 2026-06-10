import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';

export default function History() {
  const { data } = useQuery({ queryKey: ['jobs'], queryFn: api.listJobs });
  const { data: instances } = useQuery({ queryKey: ['instances'], queryFn: api.listInstances });

  const instanceMap = new Map(instances?.map(i => [i.id, i.label]) ?? []);

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">Migration history</h2>
      {!data?.length && <div className="text-sm text-zinc-500">No jobs yet.</div>}
      <ul className="space-y-2">
        {data?.map(j => {
          const destNames = j.destIds.map(id => instanceMap.get(id) ?? id.slice(0, 8)).join(', ');
          return (
            <li key={j.id} className="bg-zinc-900 border border-zinc-800 rounded p-3 flex items-center gap-3 text-sm">
              <Link to={`/jobs/${j.id}`} className="text-zinc-300 hover:text-zinc-100 font-medium">
                {destNames}
              </Link>
              <span className={`text-xs ${statusColor(j.status)}`}>{j.status}</span>
              <span className="text-xs text-zinc-500">{new Date(j.createdAt).toLocaleString()}</span>
              <span className="text-xs text-zinc-500">
                {j.docIds.length} doc
                {j.emptyFirst ? ' · emptied' : ''}
                {j.parentJobId ? ' · retry' : ''}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function statusColor(s: string): string {
  if (s === 'succeeded') return 'text-emerald-400';
  if (s === 'failed') return 'text-red-400';
  if (s === 'partial') return 'text-amber-400';
  if (s === 'running') return 'text-blue-400';
  return 'text-zinc-400';
}
