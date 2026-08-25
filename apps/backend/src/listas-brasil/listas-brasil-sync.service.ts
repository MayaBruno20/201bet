import { BadRequestException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ListEventStatus, ListEventType, ListFormat, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import {
  ApiV1Event,
  ApiV1Pilot,
  ListasBrasilApiClient,
} from './listas-brasil-api.client';

type PilotStats = {
  pilots: number;
  lists: number;
  rosterRows: number;
  skippedLists: string[];
};
type EventStats = { events: number; upserted: number; skipped: number; skippedSamples: string[] };

/** "Área 43" → 43; "Listas Paraguay" → null (sem código numérico). */
function parseAreaCode(listaName: string): number | null {
  const m = (listaName ?? '').match(/(\d+)/);
  return m ? Number(m[1]) : null;
}

@Injectable()
export class ListasBrasilSyncService implements OnModuleInit {
  private readonly logger = new Logger(ListasBrasilSyncService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly api: ListasBrasilApiClient,
  ) {}

  onModuleInit() {
    if (!this.api.isConfigured()) {
      this.logger.log('Listas Brasil: LISTAS_BRASIL_API_KEY ausente — sync automático desligado.');
      return;
    }
    const minutes = Number(process.env.LISTAS_BRASIL_SYNC_INTERVAL_MINUTES ?? '360'); // 6h
    if (!Number.isFinite(minutes) || minutes <= 0) {
      this.logger.log('Listas Brasil: cron desligado (intervalo <= 0). Sync só manual.');
      return;
    }
    const ms = Math.max(15, minutes) * 60_000;
    const timer = setInterval(() => {
      void this.syncAll('cron').catch((e) =>
        this.logger.error(`Sync automático falhou: ${e instanceof Error ? e.message : e}`),
      );
    }, ms);
    timer.unref?.();
    this.logger.log(`Listas Brasil: sync automático a cada ${minutes} min.`);
  }

  /** Dispara o sync em background (retorna na hora). Usado pelo botão do admin. */
  trigger(): { started: boolean; message: string } {
    if (this.running) return { started: false, message: 'Sincronização já em andamento.' };
    if (!this.api.isConfigured()) return { started: false, message: 'LISTAS_BRASIL_API_KEY não configurado.' };
    void this.syncAll('manual').catch((e) =>
      this.logger.error(`Sync manual falhou: ${e instanceof Error ? e.message : e}`),
    );
    return { started: true, message: 'Sincronização iniciada. Acompanhe o status.' };
  }

  async getStatus() {
    const rows = await this.prisma.integrationSyncState.findMany({
      where: { resource: { startsWith: 'listas-brasil:' } },
      orderBy: { resource: 'asc' },
    });
    return { running: this.running, configured: this.api.isConfigured(), resources: rows };
  }

  /** Dispara o sync completo (pilotos/listas + eventos). Idempotente por UUID. */
  async syncAll(trigger: 'manual' | 'cron'): Promise<{ pilots: PilotStats; events: EventStats }> {
    if (this.running) throw new BadRequestException('Sincronização já em andamento.');
    if (!this.api.isConfigured()) throw new BadRequestException('LISTAS_BRASIL_API_KEY não configurado.');
    this.running = true;
    this.logger.log(`Sync Listas Brasil iniciado (${trigger}).`);
    await this.mark('listas-brasil:pilots', 'running');
    await this.mark('listas-brasil:events', 'running');
    try {
      const pilots = await this.syncPilots();
      const events = await this.syncEvents();
      this.logger.log(
        `Sync concluído: ${pilots.pilots} pilotos / ${pilots.lists} listas / ${pilots.rosterRows} no roster · ${events.upserted} eventos.`,
      );
      return { pilots, events };
    } finally {
      this.running = false;
    }
  }

  // ── Pilotos + listas + roster ──────────────────────────

  private async syncPilots(): Promise<PilotStats> {
    try {
      const all: ApiV1Pilot[] = [];
      await this.api.readAll<ApiV1Pilot>('pilots', async (items) => {
        all.push(...items);
      });

      // 1) Garante as BrazilList (por área). Guarda listaId → brazilListId.
      const listMap = new Map<string, string>();
      const skippedLists: string[] = [];
      // Captura tb o campo `area` (DDD real) do 1º piloto de cada lista — é a
      // fonte confiável da área, não o número do NOME (que pode não bater).
      const seenLists = new Map<string, { name: string; area: string | null }>();
      for (const p of all) {
        if (p.listaId && !seenLists.has(p.listaId)) seenLists.set(p.listaId, { name: p.listaName, area: p.area });
      }
      for (const [listaId, meta] of seenLists) {
        const brazilListId = await this.ensureList(listaId, meta.name, meta.area);
        if (brazilListId) listMap.set(listaId, brazilListId);
        else if (!skippedLists.includes(meta.name)) skippedLists.push(meta.name);
      }

      // 2) Upsert de pilotos (Driver) + carro (Car) + fotos re-hospedadas.
      const driverByPilot = new Map<string, string>();
      for (const p of all) {
        const driverId = await this.upsertDriver(p);
        driverByPilot.set(p.id, driverId);
        await this.upsertCar(driverId, p);
      }

      // 3) Reconstrói o roster de cada lista (posição = listPosition + 1).
      let rosterRows = 0;
      for (const [listaId, brazilListId] of listMap) {
        const pilots = all.filter((p) => p.listaId === listaId && p.isActive);
        rosterRows += await this.rebuildRoster(brazilListId, pilots, driverByPilot);
      }

      const stats: PilotStats = { pilots: all.length, lists: listMap.size, rosterRows, skippedLists };
      await this.mark('listas-brasil:pilots', 'ok', stats);
      return stats;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await this.mark('listas-brasil:pilots', 'error', undefined, msg);
      throw e;
    }
  }

  private async ensureList(listaId: string, listaName: string, apiArea?: string | null): Promise<string | null> {
    const byExternal = await this.prisma.brazilList.findUnique({ where: { listasBrasilId: listaId } });
    if (byExternal) return byExternal.id;

    // Área = campo `area` da API (DDD real) quando presente — mesmo que dê null
    // (ex.: "ARG"), NÃO caímos no nome, senão uma lista argentina "Área 11"
    // roubaria o DDD 11 brasileiro. Só usa o nome quando a API não manda area.
    const area =
      apiArea != null && apiArea.trim() !== ''
        ? parseAreaCode(apiArea)
        : parseAreaCode(listaName);
    if (area == null) return null; // "ARG"/"Paraguay"/sem código → fora das áreas numéricas

    const byArea = await this.prisma.brazilList.findUnique({ where: { areaCode: area } });
    if (byArea) {
      // Vincula só se a área ainda não tem dono externo. Se já pertence a OUTRA
      // lista, é colisão — NÃO sobrescreve (era isso que trocava o roster da
      // Área 11 pela lista errada).
      if (byArea.listasBrasilId == null || byArea.listasBrasilId === listaId) {
        await this.prisma.brazilList.update({
          where: { id: byArea.id },
          data: { listasBrasilId: listaId },
        });
        return byArea.id;
      }
      this.logger.warn(
        `Colisão de área ${area}: lista ${listaId} ("${listaName}") ignorada — área já é da lista ${byArea.listasBrasilId}.`,
      );
      return null;
    }
    const created = await this.prisma.brazilList.create({
      data: { areaCode: area, listasBrasilId: listaId, name: `Lista ${listaName}`, format: ListFormat.TOP_20 },
    });
    return created.id;
  }

  private async upsertDriver(p: ApiV1Pilot): Promise<string> {
    const avatarUrl = p.avatarUrl ? await this.rehost(p.avatarUrl) : null;
    const data = {
      name: (p.name ?? '').trim() || 'Piloto',
      nickname: p.nickname?.trim() || null,
      team: p.teamInfo?.name?.trim() || null,
      hometown: p.region?.trim() || null,
      active: p.isActive,
      // Só sobrescreve a foto quando conseguimos re-hospedar uma nova.
      ...(avatarUrl ? { avatarUrl } : {}),
    };
    const existing = await this.prisma.driver.findUnique({ where: { listasBrasilId: p.id } });
    if (existing) {
      await this.prisma.driver.update({ where: { id: existing.id }, data });
      return existing.id;
    }
    const created = await this.prisma.driver.create({ data: { ...data, listasBrasilId: p.id } });
    return created.id;
  }

  private async upsertCar(driverId: string, p: ApiV1Pilot): Promise<void> {
    if (!p.carModel && !p.carImageUrl && !p.car?.modelo) return;
    const photoUrl = p.carImageUrl ? await this.rehost(p.carImageUrl) : null;
    const carName = (p.carModel || p.car?.modelo || 'Carro').trim();
    const category = p.category?.trim() || '';
    const existing = await this.prisma.car.findFirst({
      where: { driverId },
      orderBy: { createdAt: 'asc' },
    });
    const data = { name: carName, category, ...(photoUrl ? { photoUrl } : {}) };
    if (existing) await this.prisma.car.update({ where: { id: existing.id }, data });
    else await this.prisma.car.create({ data: { driverId, ...data } });
  }

  private async rebuildRoster(
    brazilListId: string,
    pilots: ApiV1Pilot[],
    driverByPilot: Map<string, string>,
  ): Promise<number> {
    // Dedupe por posição (mantém o primeiro) e por driver.
    const byPos = new Map<number, ApiV1Pilot>();
    const usedDrivers = new Set<string>();
    for (const p of [...pilots].sort((a, b) => a.listPosition - b.listPosition)) {
      const pos = (p.listPosition ?? 0) + 1; // ladder base-1 (posição 1 = rei)
      const driverId = driverByPilot.get(p.id);
      if (pos < 1 || !driverId || byPos.has(pos) || usedDrivers.has(driverId)) continue;
      byPos.set(pos, p);
      usedDrivers.add(driverId);
    }
    return this.prisma.$transaction(
      async (tx) => {
        await tx.listRoster.deleteMany({ where: { listId: brazilListId } });
        let n = 0;
        for (const [pos, p] of byPos) {
          const driverId = driverByPilot.get(p.id)!;
          await tx.listRoster.create({
            data: { listId: brazilListId, driverId, position: pos, isKing: pos === 1 },
          });
          n += 1;
        }
        return n;
      },
      { timeout: 30000, maxWait: 10000 },
    );
  }

  // ── Eventos (só metadados; NÃO toca status/eventId/featured — lifecycle nosso) ──

  private async syncEvents(): Promise<EventStats> {
    try {
      const all: ApiV1Event[] = [];
      await this.api.readAll<ApiV1Event>('events', async (items) => {
        all.push(...items);
      });

      let upserted = 0;
      const skipped: string[] = [];
      for (const e of all) {
        if (e.type !== 'rodada') { skipped.push(`${e.name} (${e.type})`); continue; }
        if (!e.listaId) { skipped.push(`${e.name} (sem lista)`); continue; }
        const bl = await this.prisma.brazilList.findUnique({ where: { listasBrasilId: e.listaId } });
        if (!bl) { skipped.push(`${e.name} (lista não sincronizada)`); continue; }

        const bannerUrl = e.imageUrl ? await this.rehost(e.imageUrl) : null;
        const safe: Prisma.ListEventUncheckedUpdateInput = {
          name: e.name,
          scheduledAt: new Date(e.date),
          endsAt: e.dateEnd ? new Date(e.dateEnd) : null,
          ...(e.description ? { notes: e.description } : {}),
          ...(bannerUrl ? { bannerUrl } : {}),
        };

        let ev = await this.prisma.listEvent.findUnique({ where: { listasBrasilId: e.id } });
        if (!ev) {
          ev = await this.prisma.listEvent.findFirst({
            where: { listId: bl.id, name: e.name, listasBrasilId: null },
          });
        }
        if (ev) {
          await this.prisma.listEvent.update({
            where: { id: ev.id },
            data: { ...safe, listasBrasilId: e.id },
          });
        } else {
          await this.prisma.listEvent.create({
            data: {
              listId: bl.id,
              listasBrasilId: e.id,
              name: e.name,
              type: ListEventType.REGULAR,
              status: ListEventStatus.DRAFT,
              scheduledAt: new Date(e.date),
              endsAt: e.dateEnd ? new Date(e.dateEnd) : null,
              notes: e.description ?? null,
              bannerUrl: bannerUrl ?? null,
            },
          });
        }
        upserted += 1;
      }

      const stats: EventStats = {
        events: all.length,
        upserted,
        skipped: skipped.length,
        skippedSamples: skipped.slice(0, 10),
      };
      await this.mark('listas-brasil:events', 'ok', stats);
      return stats;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await this.mark('listas-brasil:events', 'error', undefined, msg);
      throw e;
    }
  }

  // ── Fotos: re-hospeda no nosso store (UploadedImage), dedupe por URL de origem ──

  private async rehost(sourceUrl: string): Promise<string | null> {
    try {
      const cached = await this.prisma.externalImageCache.findUnique({ where: { sourceUrl } });
      if (cached) return cached.url;

      const res = await fetch(sourceUrl, { redirect: 'follow' });
      if (!res.ok) return null;
      const contentType = (res.headers.get('content-type') ?? 'image/jpeg').split(';')[0].trim();
      if (!/^image\//.test(contentType)) return null;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length === 0 || buf.length > 8 * 1024 * 1024) return null; // cap 8MB

      const img = await this.prisma.uploadedImage.create({
        data: { mimeType: contentType, data: buf, sizeBytes: buf.length },
        select: { id: true },
      });
      const url = `/api/images/${img.id}`;
      await this.prisma.externalImageCache
        .create({ data: { sourceUrl, imageId: img.id, url } })
        .catch(() => undefined);
      return url;
    } catch (e) {
      this.logger.warn(`Re-hospedagem falhou (${sourceUrl}): ${e instanceof Error ? e.message : e}`);
      return null;
    }
  }

  private async mark(
    resource: string,
    status: 'running' | 'ok' | 'error',
    stats?: PilotStats | EventStats,
    message?: string,
  ): Promise<void> {
    const data = {
      lastRunAt: new Date(),
      lastStatus: status,
      lastMessage: message ?? null,
      ...(stats ? { stats: stats as unknown as Prisma.InputJsonValue } : {}),
    };
    await this.prisma.integrationSyncState
      .upsert({ where: { resource }, create: { resource, ...data }, update: data })
      .catch(() => undefined);
  }
}
