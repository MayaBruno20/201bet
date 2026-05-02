import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

export type DisclaimerVariant = 'amber' | 'red' | 'blue' | 'emerald' | 'violet' | 'neutral';

const VALID_VARIANTS: DisclaimerVariant[] = ['amber', 'red', 'blue', 'emerald', 'violet', 'neutral'];

export type UpsertDisclaimerInput = {
  message?: string;
  active?: boolean;
  variant?: string;
  scrolling?: boolean;
  priority?: number;
};

@Injectable()
export class SiteDisclaimersService {
  constructor(private readonly prisma: PrismaService) {}

  async listPublic() {
    return this.prisma.siteDisclaimer.findMany({
      where: { active: true },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async listAll() {
    return this.prisma.siteDisclaimer.findMany({
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async create(input: UpsertDisclaimerInput) {
    if (!input.message || !input.message.trim()) {
      throw new BadRequestException('Mensagem do disclaimer é obrigatória');
    }
    const variant = this.normalizeVariant(input.variant);
    return this.prisma.siteDisclaimer.create({
      data: {
        message: input.message.trim(),
        active: input.active ?? true,
        variant,
        scrolling: input.scrolling ?? false,
        priority: input.priority ?? 0,
      },
    });
  }

  async update(id: string, input: UpsertDisclaimerInput) {
    const existing = await this.prisma.siteDisclaimer.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Disclaimer não encontrado');

    const data: Prisma.SiteDisclaimerUpdateInput = {};
    if (input.message !== undefined) {
      const trimmed = input.message.trim();
      if (!trimmed) throw new BadRequestException('Mensagem não pode ficar vazia');
      data.message = trimmed;
    }
    if (input.active !== undefined) data.active = input.active;
    if (input.variant !== undefined) data.variant = this.normalizeVariant(input.variant);
    if (input.scrolling !== undefined) data.scrolling = input.scrolling;
    if (input.priority !== undefined) data.priority = input.priority;

    return this.prisma.siteDisclaimer.update({ where: { id }, data });
  }

  async remove(id: string) {
    const existing = await this.prisma.siteDisclaimer.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Disclaimer não encontrado');
    await this.prisma.siteDisclaimer.delete({ where: { id } });
    return { ok: true };
  }

  private normalizeVariant(raw?: string): string {
    if (!raw) return 'amber';
    const lower = raw.toLowerCase();
    if (!VALID_VARIANTS.includes(lower as DisclaimerVariant)) {
      throw new BadRequestException(`Variante inválida. Use: ${VALID_VARIANTS.join(', ')}`);
    }
    return lower;
  }
}
