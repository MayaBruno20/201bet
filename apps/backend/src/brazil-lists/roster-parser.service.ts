import { BadRequestException, Injectable, Logger } from '@nestjs/common';

/**
 * Entrada parseada de um piloto. Pré-aprovada — o admin ainda revisa e corrige
 * o que estiver errado antes de aplicar o bulk-replace no roster.
 */
export interface ParsedRosterEntry {
  position: number;
  driverName: string;
  nickname: string | null;
  carName: string | null;
  carNumber: string | null;
}

const ALLOWED_MIME_TYPES = new Set<string>([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'application/msword', // .doc legado (mammoth abre alguns)
]);

const HEADER_TOKENS = ['rank', 'piloto', 'carro', 'configuração', 'configuracao', 'time', 'equipe'];
const HEADER_TOKEN_SET = new Set(HEADER_TOKENS);
const EMPTY_TOKENS = new Set(['—', '–', '-', '_', 'sem carro', 'n/a', 'na']);
const POSITION_ONLY_RE = /^(\d{1,3})\s*[ºo°.\):]?\s*$/u;
const NBSP = String.fromCharCode(0x00a0);

/**
 * Quebra o texto de um documento de lista e retorna os pilotos no formato
 * que o admin pode revisar/editar antes do bulk-replace.
 *
 * Tolerância maior do que strict — vale o admin corrigir 1 linha torta do que
 * jogar fora o documento inteiro porque uma linha estava mal formatada.
 */
@Injectable()
export class RosterParserService {
  private readonly logger = new Logger(RosterParserService.name);

  async parseFile(buffer: Buffer, mimeType: string): Promise<ParsedRosterEntry[]> {
    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      throw new BadRequestException(`Tipo de arquivo não suportado: ${mimeType}. Use PDF ou DOCX.`);
    }
    const text = await this.extractText(buffer, mimeType);
    return this.parseRosterText(text);
  }

  private async extractText(buffer: Buffer, mimeType: string): Promise<string> {
    if (mimeType === 'application/pdf') {
      // pdf-parse muda shape entre versões (1.x default export, 2.x named/namespace).
      // Cast como `any` no namespace e resolvemos em runtime.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mod = (await import('pdf-parse')) as any;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const parser: (b: Buffer) => Promise<{ text: string }> =
        typeof mod === 'function' ? mod : (mod.default ?? mod.PDFParse ?? mod);
      if (typeof parser !== 'function') {
        throw new Error('pdf-parse: não foi possível resolver a função exportada.');
      }
      const result = await parser(buffer);
      return result.text ?? '';
    }
    // DOCX
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ buffer });
    return result.value ?? '';
  }

  /**
   * Parse robusto. Cobre 2 formatos:
   *
   *  A) Inline (texto / PDF simples):
   *       `1º Eduardo Campagnolo    Saveiro 4x4 #550`
   *
   *  B) Tabela com célula-por-linha (mammoth extraindo .docx com tabela):
   *       `1º`
   *       `Eduardo Campagnolo`
   *       `Saveiro 4x4 #550`
   *       `2º`
   *       `Marciano Huff "Karca"`
   *       `Chevette #1000`
   *
   * Detecta automaticamente qual é o formato. Cabeçalhos
   * (Rank, Piloto, Carro / Configuração) são pulados.
   */
  parseRosterText(text: string): ParsedRosterEntry[] {
    if (!text || !text.trim()) {
      throw new BadRequestException('Documento vazio ou não foi possível extrair texto.');
    }

    const lines = text
      .split(/\r?\n/)
      .map((l) => l.split(NBSP).join(' ').trim())
      .filter(Boolean)
      .filter((l) => !this.isHeaderToken(l) && !this.looksLikeMultiHeader(l));

    const out: ParsedRosterEntry[] = [];
    const seenPositions = new Set<number>();

    let i = 0;
    while (i < lines.length) {
      const line = lines[i];

      // Formato B: linha é só "1º" → consome próximas linhas (nome, carro) até a próxima posição
      const posOnly = line.match(POSITION_ONLY_RE);
      if (posOnly) {
        const position = Number(posOnly[1]);
        i += 1;

        const buffer: string[] = [];
        while (i < lines.length && !POSITION_ONLY_RE.test(lines[i])) {
          // se a próxima linha for inline `2º Nome ...`, paramos antes (próxima entry)
          if (/^\d{1,3}\s*[ºo°.\):]\s+\S/.test(lines[i])) break;
          buffer.push(lines[i]);
          i += 1;
        }

        if (buffer.length === 0) continue;
        const namePart = buffer[0];
        const carPart = buffer.slice(1).join(' ').trim();

        const { driverName, nickname } = this.extractNickname(namePart);
        const { carName, carNumber } = this.extractCar(carPart);

        if (driverName && !seenPositions.has(position) && position >= 1 && position <= 200) {
          seenPositions.add(position);
          out.push({ position, driverName, nickname, carName, carNumber });
        }
        continue;
      }

      // Formato A: tudo na mesma linha
      const parsed = this.parseLine(line);
      if (parsed && !seenPositions.has(parsed.position)) {
        seenPositions.add(parsed.position);
        out.push(parsed);
      }
      i += 1;
    }

    if (out.length === 0) {
      throw new BadRequestException(
        'Nenhum piloto reconhecido no documento. Verifique se o formato é "Nº Nome ... Carro #Número" ou tabela com colunas Rank/Piloto/Carro.',
      );
    }

    out.sort((a, b) => a.position - b.position);
    return out;
  }

  /** Linha sozinha é cabeçalho de coluna (tabela com célula-por-linha). */
  private isHeaderToken(line: string): boolean {
    const low = line.toLowerCase().trim().replace(/\s+\/.*$/, '').trim();
    return HEADER_TOKEN_SET.has(low);
  }

  /** Linha inline com 2+ tokens de cabeçalho. */
  private looksLikeMultiHeader(line: string): boolean {
    const low = line.toLowerCase();
    return HEADER_TOKENS.filter((t) => low.includes(t)).length >= 2;
  }

  private parseLine(line: string): ParsedRosterEntry | null {
    const posMatch = line.match(/^(\d{1,3})\s*[ºo°.\):]?\s+(.+)$/u);
    if (!posMatch) return null;

    const position = Number(posMatch[1]);
    if (!Number.isFinite(position) || position < 1 || position > 200) return null;

    const rest = posMatch[2].trim();

    // separador entre colunas: tab, 3+ espaços ou pipe
    const split = rest.split(/\t+|\s{3,}|\s+\|\s+/u);
    let namePart = split[0].trim();
    let carPart = split.slice(1).join(' ').trim();

    // fallback: se não dividiu e tem `#`, o `#` provavelmente marca início do carro.
    if (!carPart && namePart.includes('#')) {
      const hashIdx = namePart.indexOf('#');
      const before = namePart.slice(0, hashIdx).trimEnd();
      const lastSpace = before.lastIndexOf(' ');
      if (lastSpace > 0) {
        const candidateCarStart = this.findCarBoundary(before);
        if (candidateCarStart > 0 && candidateCarStart < namePart.length - 2) {
          carPart = namePart.slice(candidateCarStart).trim();
          namePart = namePart.slice(0, candidateCarStart).trim();
        }
      }
    }

    if (!namePart) return null;

    const { driverName, nickname } = this.extractNickname(namePart);
    const { carName, carNumber } = this.extractCar(carPart);

    return { position, driverName, nickname, carName, carNumber };
  }

  /**
   * Heurística pra achar onde o "carro" começa numa linha tipo
   *   "Eduardo Campagnolo Saveiro 4x4 #550"
   * Recua até 4 tokens antes do `#`. Melhor errar pro lado de NÃO dividir
   * do que dividir errado — o admin corrige no preview.
   */
  private findCarBoundary(before: string): number {
    const tokens = before.split(/\s+/);
    if (tokens.length <= 2) return -1;
    const sliceCount = Math.min(4, tokens.length - 1);
    const candidate = tokens.slice(-sliceCount).join(' ');
    return before.length - candidate.length;
  }

  private extractNickname(namePart: string): { driverName: string; nickname: string | null } {
    // aspas retas " ' e tipográficas “ ” ‘ ’
    const m = namePart.match(/^(.+?)\s+["“'‘]([^"”'’]+)["”'’]\s*$/u);
    if (m) {
      return { driverName: m[1].trim(), nickname: m[2].trim() };
    }
    return { driverName: namePart, nickname: null };
  }

  private extractCar(carPart: string): { carName: string | null; carNumber: string | null } {
    if (!carPart) return { carName: null, carNumber: null };
    const cleaned = carPart.trim();
    if (EMPTY_TOKENS.has(cleaned.toLowerCase())) return { carName: null, carNumber: null };

    // "... #123" ou "... nº 123"
    const m = cleaned.match(/^(.+?)\s+(?:#|n[ºo°.]?\s*)\s*(\d+)\s*$/iu);
    if (m) {
      const name = m[1].trim().replace(/[\-–—]+$/, '').trim();
      return { carName: name || null, carNumber: m[2] };
    }
    return { carName: cleaned, carNumber: null };
  }
}
