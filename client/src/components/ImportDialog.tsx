import { useState } from 'react';
import { Upload, FileDown, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Modal, Button, useToast, Badge } from '@/components/ui';
import { api, downloadFile, ApiError } from '@/lib/api';

interface ParsedRow {
  [key: string]: string | number | undefined;
}

interface ImportResult {
  created?: number;
  updated?: number;
  skipped?: number;
  failed?: number;
  errors?: Array<{ row: number; message: string }>;
  dryRun?: boolean;
  total?: number;
}

/**
 * CSV import with a mandatory dry-run: the file is parsed server-side, validated
 * and previewed before anything is written.
 */
export function ImportDialog({
  entity,
  title,
  onClose,
  onDone,
}: {
  entity: 'students' | 'leads';
  title: string;
  onClose: () => void;
  onDone?: () => void;
}) {
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const downloadTemplate = async () => {
    try {
      await downloadFile(`/reports/import/template/${entity}`, `${entity}-template.csv`);
    } catch (e) {
      toast.error('Could not download template', (e as ApiError).message);
    }
  };

  const handleFile = async (f: File) => {
    setFile(f);
    setError(null);
    setResult(null);
    setParsing(true);
    try {
      const fd = new FormData();
      fd.append('file', f);
      const parsed = await api.post<{ rows: ParsedRow[] }>('/reports/import/parse', fd);
      setRows(parsed.rows ?? []);
      if (!parsed.rows?.length) setError('That file has no readable rows.');
    } catch (e) {
      setError((e as ApiError).message);
      setRows([]);
    } finally {
      setParsing(false);
    }
  };

  const run = async (dryRun: boolean) => {
    setImporting(true);
    setError(null);
    try {
      const res = await api.post<ImportResult>(`/reports/import/${entity}`, { rows, dryRun });
      setResult({ ...res, dryRun });
      if (!dryRun) {
        toast.success('Import complete', `${res.created ?? 0} created, ${res.updated ?? 0} updated.`);
        onDone?.();
      }
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setImporting(false);
    }
  };

  const headers = rows.length ? Object.keys(rows[0]).slice(0, 5) : [];

  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      description="Upload a CSV, preview what will change, then commit."
      size="xl"
      footer={
        <>
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!rows.length || importing}
            loading={importing && result?.dryRun !== false}
            onClick={() => run(true)}
          >
            Validate ({rows.length})
          </Button>
          <Button
            size="sm"
            disabled={!rows.length || importing}
            onClick={() => run(false)}
          >
            Import {rows.length ? `${rows.length} rows` : ''}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={downloadTemplate} icon={<FileDown className="h-4 w-4" />}>
            Download template
          </Button>
          <p className="text-xs text-ink-500">Up to 2,000 rows per file.</p>
        </div>

        <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-ink-200 bg-ink-50/50 px-6 py-8 text-center transition hover:border-[var(--brand-primary)] hover:bg-[var(--brand-primary)]/5">
          <Upload className="mb-2 h-6 w-6 text-ink-400" />
          <p className="text-sm font-medium text-ink-700">{file ? file.name : 'Choose a CSV file'}</p>
          <p className="mt-0.5 text-xs text-ink-500">{parsing ? 'Parsing…' : 'or drag and drop it here'}</p>
          <input
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
        </label>

        {error && (
          <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-sm text-rose-700">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {rows.length > 0 && (
          <div className="overflow-hidden rounded-xl border border-ink-200">
            <div className="flex items-center justify-between border-b border-ink-200 bg-ink-50 px-3.5 py-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">
                Preview · first {Math.min(5, rows.length)} of {rows.length}
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13px]">
                <thead>
                  <tr>
                    {headers.map((h) => (
                      <th key={h} className="border-b border-ink-200 px-3 py-2 font-semibold text-ink-600">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 5).map((r, i) => (
                    <tr key={i}>
                      {headers.map((h) => (
                        <td key={h} className="border-b border-ink-100 px-3 py-2 text-ink-700">
                          {String(r[h] ?? '—')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {result && (
          <div className="rounded-xl border border-ink-200 bg-white p-4">
            <div className="mb-3 flex items-center gap-2">
              {result.dryRun ? (
                <Badge tone="PENDING">Validation only — nothing saved</Badge>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700">
                  <CheckCircle2 className="h-4 w-4" /> Import committed
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Created" value={result.created ?? 0} tone="text-emerald-700" />
              <Stat label="Updated" value={result.updated ?? 0} tone="text-sky-700" />
              <Stat label="Skipped" value={result.skipped ?? 0} tone="text-ink-600" />
              <Stat label="Failed" value={result.failed ?? result.errors?.length ?? 0} tone="text-rose-700" />
            </div>
            {result.errors && result.errors.length > 0 && (
              <div className="mt-3 max-h-40 overflow-y-auto rounded-lg bg-rose-50 p-3">
                {result.errors.slice(0, 50).map((e, i) => (
                  <p key={i} className="text-xs text-rose-700">
                    Row {e.row}: {e.message}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-lg bg-ink-50 px-3 py-2">
      <p className="text-[11px] font-medium uppercase tracking-wide text-ink-500">{label}</p>
      <p className={`mt-0.5 text-lg font-bold ${tone}`}>{value}</p>
    </div>
  );
}
