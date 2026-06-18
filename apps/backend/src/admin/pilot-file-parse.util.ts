/**
 * Parser de PDF para importação de pilotos do Armageddon.
 *
 * O PDF é uma tabela com colunas: # · AREA · NOME · APELIDO (cabeçalho repetido
 * em cada página). Texto puro perderia a separação NOME/APELIDO (ambos têm
 * espaços), então usamos as POSIÇÕES (x) de cada item de texto do pdf.js e
 * ancoramos as colunas pelos x do cabeçalho ("AREA"/"NOME"/"APELIDO").
 *
 * Linhas com NOME vazio mas APELIDO preenchido são mantidas (o consumidor usa
 * o apelido como nome). O "#" (numeração) é descartado.
 */

export type ParsedPilotRow = { area: string; name: string; nickname: string };

type TextCell = { s: string; x: number; y: number };

// import dinâmico — pdfjs-dist é ESM-only; tsconfig é nodenext, então o import()
// é preservado em runtime.
async function loadPdfjs(): Promise<any> {
  return import('pdfjs-dist/legacy/build/pdf.mjs');
}

export async function parsePilotsFromPdf(buffer: Buffer): Promise<ParsedPilotRow[]> {
  const pdfjs = await loadPdfjs();
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(buffer),
    isEvalSupported: false,
    useSystemFonts: true,
  }).promise;

  const out: ParsedPilotRow[] = [];

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const cells: TextCell[] = content.items
      .filter((i: any) => typeof i.str === 'string' && i.str.trim().length > 0)
      .map((i: any) => ({ s: i.str.trim(), x: i.transform[4] as number, y: i.transform[5] as number }));
    if (!cells.length) continue;

    // Agrupa itens em linhas visuais por y (tolerância de ~4pt).
    const rows: { y: number; cells: TextCell[] }[] = [];
    const TOL = 4;
    for (const c of cells) {
      let row = rows.find((r) => Math.abs(r.y - c.y) <= TOL);
      if (!row) { row = { y: c.y, cells: [] }; rows.push(row); }
      row.cells.push(c);
    }

    // Acha o cabeçalho desta página (tem AREA/NOME/APELIDO) e os x das colunas.
    let colArea = NaN, colNome = NaN, colApelido = NaN, headerY = NaN;
    for (const r of rows) {
      const up = r.cells.map((c) => c.s.toUpperCase());
      if (up.includes('NOME') && up.includes('APELIDO')) {
        for (const c of r.cells) {
          const u = c.s.toUpperCase();
          if (u === 'AREA' || u === 'ÁREA') colArea = c.x;
          else if (u === 'NOME') colNome = c.x;
          else if (u === 'APELIDO') colApelido = c.x;
        }
        headerY = r.y;
        break;
      }
    }
    if (Number.isNaN(colNome) || Number.isNaN(colApelido)) continue;

    // Limites das colunas (com folga de 2pt à esquerda de cada cabeçalho).
    const nomeStart = colNome - 2;
    const apelidoStart = colApelido - 2;
    const areaStart = Number.isNaN(colArea) ? -Infinity : colArea - 2;

    for (const r of rows) {
      // Só linhas ABAIXO do cabeçalho (no PDF, y menor = mais embaixo).
      if (!(r.y < headerY)) continue;
      const up = r.cells.map((c) => c.s.toUpperCase());
      if (up.includes('NOME') && up.includes('APELIDO')) continue; // cabeçalho repetido

      const pick = (lo: number, hi: number) =>
        r.cells.filter((c) => c.x >= lo && c.x < hi).sort((a, b) => a.x - b.x).map((c) => c.s).join(' ').trim();

      const area = pick(areaStart, nomeStart);
      const name = pick(nomeStart, apelidoStart);
      const nickname = pick(apelidoStart, Infinity);

      if (!name && !nickname) continue; // linha sem conteúdo útil
      // Descarta linhas de título (sem área-código e sem cara de dado).
      if (!area && !name && nickname) { /* só apelido — mantém */ }
      out.push({ area, name, nickname });
    }
  }

  await doc.destroy?.();
  return out;
}
