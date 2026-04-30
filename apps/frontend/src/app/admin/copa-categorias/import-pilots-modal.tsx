'use client';

import { useMemo, useRef, useState } from 'react';

type TimeCategoryValue =
  | 'ORIGINAL_10S'
  | 'CAT_9S'
  | 'CAT_8_5S'
  | 'CAT_8S'
  | 'CAT_7_5S'
  | 'CAT_7S'
  | 'CAT_6_5S'
  | 'CAT_6S'
  | 'CAT_5_5S'
  | 'TUDOKIDA';

const CATEGORY_LABELS: Record<TimeCategoryValue, string> = {
  ORIGINAL_10S: 'Original 10s',
  CAT_9S: '9s',
  CAT_8_5S: '8,5s',
  CAT_8S: '8s',
  CAT_7_5S: '7,5s',
  CAT_7S: '7s',
  CAT_6_5S: '6,5s',
  CAT_6S: '6s',
  CAT_5_5S: '5,5s',
  TUDOKIDA: 'TUDOKIDÁ',
};

export type ImportEntry = {
  rowId: string;
  excelRow: number;
  category: TimeCategoryValue | '';
  driverName: string;
  carName: string;
  carNumber: string;
  driverNickname: string;
  driverTeam: string;
  driverHometown: string;
  email: string;
  phone: string;
  cpf: string;
  rawCategory: string;
  rawProduct: string;
};

type Props = {
  eventId: string;
  eventName: string;
  onClose: () => void;
  onImported: (summary: ImportSummary) => void;
  postJson: <T>(path: string, body: unknown) => Promise<T>;
};

export type ImportSummary = {
  imported: number;
  skipped: number;
  bracketsCreated: number;
  perCategory: Record<string, { imported: number; skipped: number; bracketId: string }>;
  skippedDetails: Array<{ row: number; driverName: string; reason: string }>;
};

// Mapeia a string da coluna "Produto" do Excel para o enum TimeCategory
function mapCategoryFromText(text: string): TimeCategoryValue | '' {
  if (!text) return '';
  const t = text.toUpperCase();
  // remove acentos para match em TUDOKIDA / TUDOKID�
  const normalized = t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Z0-9 ,.-]/g, '');

  if (normalized.includes('TUDOKIDA') || normalized.includes('TUDO KIDA') || normalized.includes('LIVRE')) {
    return 'TUDOKIDA';
  }
  if (normalized.includes('ORIGINAL') || normalized.includes('10 SEGUNDO') || normalized.includes('10S')) {
    return 'ORIGINAL_10S';
  }
  // Mapeia tempo (em segundos) → categoria
  // Casos: "9,0 SEGUNDOS", "8,5 SEGUNDOS", "7,0  SEGUNDOS", etc.
  const match = normalized.match(/(\d+)[,.](\d+)\s*SEGUND/);
  if (match) {
    const whole = parseInt(match[1], 10);
    const frac = parseInt(match[2], 10);
    const tenths = whole + (frac >= 5 ? 0.5 : 0);
    const map: Record<string, TimeCategoryValue> = {
      '9.0': 'CAT_9S',
      '9': 'CAT_9S',
      '8.5': 'CAT_8_5S',
      '8.0': 'CAT_8S',
      '8': 'CAT_8S',
      '7.5': 'CAT_7_5S',
      '7.0': 'CAT_7S',
      '7': 'CAT_7S',
      '6.5': 'CAT_6_5S',
      '6.0': 'CAT_6S',
      '6': 'CAT_6S',
      '5.5': 'CAT_5_5S',
    };
    const key = tenths === Math.floor(tenths) ? `${tenths}` : `${tenths}`;
    if (map[key]) return map[key];
  }
  // Fallback: numero inteiro de segundos seguido de "SEGUNDOS"
  const matchInt = normalized.match(/(\d+)\s*SEGUND/);
  if (matchInt) {
    const v = parseInt(matchInt[1], 10);
    if (v === 10) return 'ORIGINAL_10S';
    if (v === 9) return 'CAT_9S';
    if (v === 8) return 'CAT_8S';
    if (v === 7) return 'CAT_7S';
    if (v === 6) return 'CAT_6S';
  }
  return '';
}

export function ImportPilotsModal({ eventId, eventName, onClose, onImported, postJson }: Props) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [step, setStep] = useState<'upload' | 'review'>('upload');
  const [entries, setEntries] = useState<ImportEntry[]>([]);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [filterCategory, setFilterCategory] = useState<TimeCategoryValue | 'ALL' | 'UNMAPPED'>('ALL');

  function reset() {
    setEntries([]);
    setStep('upload');
    setSummary(null);
    setError(null);
    setFilterCategory('ALL');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleFile(file: File) {
    setParsing(true);
    setError(null);
    try {
      // dynamic import to keep xlsx out of the initial bundle
      const XLSX = await import('xlsx');
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array' });
      const sheetName = wb.SheetNames[0];
      const ws = wb.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });

      if (!rows.length) {
        setError('Planilha vazia ou sem cabeçalho na primeira aba.');
        setParsing(false);
        return;
      }

      const parsed: ImportEntry[] = rows.map((row, idx) => {
        const get = (key: string) => {
          // Procura ignorando case e espaços
          const k = Object.keys(row).find(
            (rk) => rk.trim().toLowerCase() === key.trim().toLowerCase(),
          );
          return k ? String(row[k] ?? '').trim() : '';
        };
        const product = get('Produto') || get('Categoria') || '';
        const cat = mapCategoryFromText(product);
        return {
          rowId: `${idx}`,
          excelRow: idx + 2,
          category: cat,
          driverName: (get('Nome') || get('Piloto') || '').toString(),
          carName: get('Carro') || get('Veículo') || get('Veiculo') || '',
          carNumber: get('Numero') || get('Número') || get('N°') || '',
          driverNickname: get('Apelido') || '',
          driverTeam: get('Equipe') || get('Time') || '',
          driverHometown: get('Cidade') || '',
          email: get('E-mail') || get('Email') || '',
          phone: get('Telefone Celular') || get('Telefone') || get('Celular') || '',
          cpf: get('CPF') || '',
          rawCategory: cat,
          rawProduct: product,
        };
      });

      setEntries(parsed);
      setStep('review');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao ler o arquivo Excel');
    } finally {
      setParsing(false);
    }
  }

  function updateEntry(rowId: string, patch: Partial<ImportEntry>) {
    setEntries((prev) => prev.map((e) => (e.rowId === rowId ? { ...e, ...patch } : e)));
  }

  function removeEntry(rowId: string) {
    setEntries((prev) => prev.filter((e) => e.rowId !== rowId));
  }

  const visibleEntries = useMemo(() => {
    if (filterCategory === 'ALL') return entries;
    if (filterCategory === 'UNMAPPED') return entries.filter((e) => !e.category);
    return entries.filter((e) => e.category === filterCategory);
  }, [entries, filterCategory]);

  const groups = useMemo(() => {
    const m: Record<string, number> = {};
    let unmapped = 0;
    for (const e of entries) {
      if (!e.category) unmapped += 1;
      else m[e.category] = (m[e.category] ?? 0) + 1;
    }
    return { m, unmapped };
  }, [entries]);

  const validCount = entries.filter((e) => e.category && e.driverName.trim()).length;
  const invalidCount = entries.length - validCount;

  async function handleImport() {
    setImporting(true);
    setError(null);
    try {
      const payload = {
        entries: entries
          .filter((e) => e.category && e.driverName.trim())
          .map((e) => ({
            category: e.category,
            driverName: e.driverName.trim(),
            driverNickname: e.driverNickname.trim() || undefined,
            carName: e.carName.trim() || undefined,
            carNumber: e.carNumber.trim() || undefined,
            driverTeam: e.driverTeam.trim() || undefined,
            driverHometown: e.driverHometown.trim() || undefined,
          })),
      };
      const result = await postJson<ImportSummary>(
        `/admin/category-events/${eventId}/competitors/import`,
        payload,
      );
      setSummary(result);
      onImported(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao importar');
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4'>
      <div className='relative w-full max-w-6xl max-h-[92vh] overflow-hidden rounded-2xl border border-white/10 bg-[#0d1320] flex flex-col'>
        {/* Header */}
        <div className='flex items-start justify-between gap-3 border-b border-white/10 p-5'>
          <div>
            <p className='text-[10px] font-semibold uppercase tracking-widest text-white/30'>
              Copa Categorias · Importar pilotos
            </p>
            <h2 className='mt-1 text-lg font-bold tracking-tight'>{eventName}</h2>
            <p className='mt-1 text-xs text-white/50'>
              Carregue uma planilha Excel (.xlsx) para inscrever múltiplos pilotos. A categoria é detectada
              pela coluna <strong>Produto</strong> e o piloto pela coluna <strong>Nome</strong>. Você pode revisar
              e editar antes de confirmar.
            </p>
          </div>
          <button
            type='button'
            onClick={() => {
              reset();
              onClose();
            }}
            className='rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-sm text-white/70 hover:bg-white/10'
          >
            Fechar
          </button>
        </div>

        {/* Body */}
        <div className='flex-1 overflow-auto p-5'>
          {error && (
            <div className='mb-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200'>
              {error}
            </div>
          )}

          {summary && (
            <div className='mb-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-200'>
              <p className='font-semibold'>Importação concluída.</p>
              <p className='mt-1 text-emerald-100/80'>
                Importados: {summary.imported} · Ignorados: {summary.skipped} · Categorias criadas:{' '}
                {summary.bracketsCreated}
              </p>
              {summary.skippedDetails?.length > 0 && (
                <details className='mt-2 text-xs'>
                  <summary className='cursor-pointer'>Ver linhas ignoradas ({summary.skippedDetails.length})</summary>
                  <ul className='mt-2 list-disc space-y-1 pl-5'>
                    {summary.skippedDetails.slice(0, 30).map((s, i) => (
                      <li key={i}>
                        Linha {s.row}: {s.driverName || '(sem nome)'} — {s.reason}
                      </li>
                    ))}
                    {summary.skippedDetails.length > 30 && (
                      <li>… e mais {summary.skippedDetails.length - 30} linhas.</li>
                    )}
                  </ul>
                </details>
              )}
            </div>
          )}

          {step === 'upload' && !summary && (
            <div className='rounded-2xl border border-dashed border-white/15 bg-white/[0.02] p-12 text-center'>
              <input
                ref={fileInputRef}
                type='file'
                accept='.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                className='hidden'
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleFile(f);
                }}
              />
              <p className='text-sm text-white/60'>Selecione um arquivo .xlsx exportado da loja.</p>
              <p className='mt-1 text-xs text-white/40'>
                Colunas reconhecidas: Nome (obrigatório), Produto (categoria), CPF, E-mail, Telefone Celular, Cidade.
              </p>
              <button
                type='button'
                onClick={() => fileInputRef.current?.click()}
                disabled={parsing}
                className='mt-5 rounded-xl bg-white px-5 py-2.5 text-sm font-bold text-black hover:opacity-90 disabled:opacity-50'
              >
                {parsing ? 'Lendo planilha...' : 'Escolher arquivo Excel'}
              </button>
            </div>
          )}

          {step === 'review' && !summary && (
            <div>
              {/* Summary chips */}
              <div className='mb-3 flex flex-wrap items-center gap-2'>
                <button
                  type='button'
                  onClick={() => setFilterCategory('ALL')}
                  className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${
                    filterCategory === 'ALL'
                      ? 'border-white/40 bg-white/10 text-white'
                      : 'border-white/10 bg-white/5 text-white/60 hover:bg-white/10'
                  }`}
                >
                  Todos ({entries.length})
                </button>
                {(Object.keys(CATEGORY_LABELS) as TimeCategoryValue[]).map((c) => {
                  const count = groups.m[c] ?? 0;
                  if (!count) return null;
                  return (
                    <button
                      key={c}
                      type='button'
                      onClick={() => setFilterCategory(c)}
                      className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${
                        filterCategory === c
                          ? 'border-white/40 bg-white/10 text-white'
                          : 'border-white/10 bg-white/5 text-white/60 hover:bg-white/10'
                      }`}
                    >
                      {CATEGORY_LABELS[c]} ({count})
                    </button>
                  );
                })}
                {groups.unmapped > 0 && (
                  <button
                    type='button'
                    onClick={() => setFilterCategory('UNMAPPED')}
                    className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${
                      filterCategory === 'UNMAPPED'
                        ? 'border-amber-500/60 bg-amber-500/15 text-amber-200'
                        : 'border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/15'
                    }`}
                  >
                    ⚠️ Sem categoria ({groups.unmapped})
                  </button>
                )}
              </div>

              {/* Tabela editável */}
              <div className='overflow-auto rounded-xl border border-white/10'>
                <table className='min-w-full text-xs'>
                  <thead className='bg-white/5 text-left text-[10px] uppercase tracking-wider text-white/40'>
                    <tr>
                      <th className='px-2 py-2'>#</th>
                      <th className='px-2 py-2'>Nome do piloto</th>
                      <th className='px-2 py-2'>Categoria</th>
                      <th className='px-2 py-2'>Apelido</th>
                      <th className='px-2 py-2'>Equipe</th>
                      <th className='px-2 py-2'>Carro (opc)</th>
                      <th className='px-2 py-2'>Nº</th>
                      <th className='px-2 py-2'>Cidade</th>
                      <th className='px-2 py-2'>Origem</th>
                      <th className='px-2 py-2'>—</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleEntries.map((e) => {
                      const isInvalid = !e.category || !e.driverName.trim();
                      return (
                        <tr
                          key={e.rowId}
                          className={`border-t border-white/5 ${
                            isInvalid ? 'bg-amber-500/[0.07]' : 'bg-white/[0.02]'
                          }`}
                        >
                          <td className='px-2 py-1.5 text-white/30'>{e.excelRow}</td>
                          <td className='px-2 py-1.5'>
                            <input
                              className='w-full rounded-md border border-white/10 bg-transparent px-2 py-1 text-xs'
                              value={e.driverName}
                              onChange={(ev) => updateEntry(e.rowId, { driverName: ev.target.value })}
                            />
                          </td>
                          <td className='px-2 py-1.5'>
                            <select
                              className={`w-full rounded-md border bg-transparent px-2 py-1 text-xs ${
                                e.category
                                  ? 'border-white/10'
                                  : 'border-amber-500/40 bg-amber-500/10 text-amber-200'
                              }`}
                              value={e.category}
                              onChange={(ev) =>
                                updateEntry(e.rowId, { category: ev.target.value as TimeCategoryValue | '' })
                              }
                            >
                              <option value=''>— Selecionar —</option>
                              {(Object.keys(CATEGORY_LABELS) as TimeCategoryValue[]).map((c) => (
                                <option key={c} value={c}>
                                  {CATEGORY_LABELS[c]}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className='px-2 py-1.5'>
                            <input
                              className='w-full rounded-md border border-white/10 bg-transparent px-2 py-1 text-xs'
                              value={e.driverNickname}
                              onChange={(ev) => updateEntry(e.rowId, { driverNickname: ev.target.value })}
                            />
                          </td>
                          <td className='px-2 py-1.5'>
                            <input
                              className='w-full rounded-md border border-white/10 bg-transparent px-2 py-1 text-xs'
                              value={e.driverTeam}
                              onChange={(ev) => updateEntry(e.rowId, { driverTeam: ev.target.value })}
                            />
                          </td>
                          <td className='px-2 py-1.5'>
                            <input
                              className='w-full rounded-md border border-white/10 bg-transparent px-2 py-1 text-xs'
                              value={e.carName}
                              onChange={(ev) => updateEntry(e.rowId, { carName: ev.target.value })}
                              placeholder='—'
                            />
                          </td>
                          <td className='px-2 py-1.5 w-16'>
                            <input
                              className='w-full rounded-md border border-white/10 bg-transparent px-2 py-1 text-xs'
                              value={e.carNumber}
                              onChange={(ev) => updateEntry(e.rowId, { carNumber: ev.target.value })}
                            />
                          </td>
                          <td className='px-2 py-1.5'>
                            <input
                              className='w-full rounded-md border border-white/10 bg-transparent px-2 py-1 text-xs'
                              value={e.driverHometown}
                              onChange={(ev) => updateEntry(e.rowId, { driverHometown: ev.target.value })}
                            />
                          </td>
                          <td className='px-2 py-1.5 text-[10px] text-white/30 max-w-[140px]'>
                            <span className='block truncate' title={e.rawProduct}>
                              {e.rawProduct || '—'}
                            </span>
                          </td>
                          <td className='px-2 py-1.5'>
                            <button
                              type='button'
                              onClick={() => removeEntry(e.rowId)}
                              className='rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1 text-[10px] font-bold text-red-300 hover:bg-red-500/20'
                            >
                              ×
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    {!visibleEntries.length && (
                      <tr>
                        <td colSpan={10} className='px-2 py-6 text-center text-white/40'>
                          Nenhuma linha neste filtro.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {step === 'review' && !summary && (
          <div className='flex flex-wrap items-center justify-between gap-3 border-t border-white/10 p-4'>
            <p className='text-xs text-white/60'>
              Pronto para importar:{' '}
              <span className='font-bold text-emerald-400'>{validCount}</span>
              {invalidCount > 0 && (
                <span className='ml-2 text-amber-300'>
                  · {invalidCount} sem categoria/nome serão ignorados
                </span>
              )}
            </p>
            <div className='flex items-center gap-2'>
              <button
                type='button'
                onClick={() => {
                  reset();
                }}
                className='rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold text-white/70 hover:bg-white/10'
              >
                Trocar arquivo
              </button>
              <button
                type='button'
                onClick={() => void handleImport()}
                disabled={importing || validCount === 0}
                className='rounded-lg bg-white px-4 py-2 text-xs font-bold text-black hover:opacity-90 disabled:opacity-50'
              >
                {importing ? 'Importando...' : `Importar ${validCount} pilotos`}
              </button>
            </div>
          </div>
        )}

        {summary && (
          <div className='flex items-center justify-end gap-2 border-t border-white/10 p-4'>
            <button
              type='button'
              onClick={() => {
                reset();
                onClose();
              }}
              className='rounded-lg bg-white px-4 py-2 text-xs font-bold text-black hover:opacity-90'
            >
              Concluir
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
