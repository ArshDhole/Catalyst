'use client';

export interface FileDiff {
  file: string;
  patch?: string;
  additions?: number;
  deletions?: number;
  changeCount?: number;
  status?: string;
}

function lineClass(line: string) {
  if (line.startsWith('+') && !line.startsWith('+++')) return 'bg-green-50 text-green-900';
  if (line.startsWith('-') && !line.startsWith('---')) return 'bg-red-50 text-red-900';
  if (line.startsWith('@@')) return 'bg-blue-50 text-blue-700 font-semibold';
  if (line.startsWith('---') || line.startsWith('+++')) return 'text-gray-400';
  return 'text-gray-700';
}

export default function CatalystDiffViewer({ diffs }: { diffs: FileDiff[] }) {
  if (!diffs || diffs.length === 0) {
    return <p className="text-sm text-gray-500">No file changes.</p>;
  }
  return (
    <div className="space-y-4">
      {diffs.map((d) => (
        <details key={d.file} className="border border-gray-200 rounded-lg overflow-hidden bg-white" open={diffs.length <= 3}>
          <summary className="cursor-pointer bg-gray-50 px-4 py-2 text-sm font-mono flex justify-between gap-2 text-gray-900">
            <span className="truncate">{d.file}</span>
            <span className="shrink-0 text-xs">
              {typeof d.additions === 'number' ? (
                <><span className="text-green-700">+{d.additions}</span> <span className="text-red-600">-{d.deletions}</span></>
              ) : (
                <span className="text-gray-500">{d.changeCount ?? ''} edits · {d.status}</span>
              )}
            </span>
          </summary>
          {d.patch ? (
            <pre className="overflow-x-auto text-xs leading-5 p-0 max-h-96 overflow-y-auto">
              {d.patch.split('\n').map((line, i) => (
                <div key={i} className={`px-4 whitespace-pre ${lineClass(line)}`}>{line || ' '}</div>
              ))}
            </pre>
          ) : (
            <p className="text-xs text-gray-500 px-4 py-2">Summary only — no unified patch for this file.</p>
          )}
        </details>
      ))}
    </div>
  );
}
