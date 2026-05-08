import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

/**
 * Conjunto de políticas de segurança aplicadas globalmente ao painel admin.
 * Persistidas em GlobalSetting com a chave `security.policies` (valor JSON).
 *
 * Cada campo é enforced em um lugar concreto:
 *  - mfaRequired           → bloqueia login admin sem 2FA ativo
 *  - sessionTimeoutHours   → expiração do JWT admin (assinado a cada login)
 *  - passwordMinLength     → validação no /admin/users (criar/editar) e no register público
 *  - maxLoginAttempts      → bloqueia login após N falhas em loginAttemptWindowMin
 *  - loginAttemptWindowMin → janela usada acima
 */
export type SecurityPolicies = {
  mfaRequired: boolean;
  sessionTimeoutHours: number;
  passwordMinLength: number;
  maxLoginAttempts: number;
  loginAttemptWindowMin: number;
};

const POLICY_KEY = 'security.policies';

const DEFAULTS: SecurityPolicies = {
  mfaRequired: false,
  sessionTimeoutHours: 8,
  passwordMinLength: 8,
  maxLoginAttempts: 10,
  loginAttemptWindowMin: 15,
};

function clampNumber(input: unknown, min: number, max: number, fallback: number): number {
  const n = Number(input);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

@Injectable()
export class SecurityPolicyService {
  constructor(private readonly prisma: PrismaService) {}

  /** Lê e devolve aplicando defaults para campos ausentes. */
  async get(): Promise<SecurityPolicies> {
    const row = await this.prisma.globalSetting.findUnique({ where: { key: POLICY_KEY } });
    if (!row) return { ...DEFAULTS };
    let parsed: Partial<SecurityPolicies> = {};
    try { parsed = JSON.parse(row.value) as Partial<SecurityPolicies>; }
    catch { parsed = {}; }
    return {
      mfaRequired: typeof parsed.mfaRequired === 'boolean' ? parsed.mfaRequired : DEFAULTS.mfaRequired,
      sessionTimeoutHours: clampNumber(parsed.sessionTimeoutHours, 1, 168, DEFAULTS.sessionTimeoutHours),
      passwordMinLength: clampNumber(parsed.passwordMinLength, 6, 64, DEFAULTS.passwordMinLength),
      maxLoginAttempts: clampNumber(parsed.maxLoginAttempts, 3, 100, DEFAULTS.maxLoginAttempts),
      loginAttemptWindowMin: clampNumber(parsed.loginAttemptWindowMin, 1, 1440, DEFAULTS.loginAttemptWindowMin),
    };
  }

  async update(
    patch: Partial<SecurityPolicies>,
    actorUserId?: string,
  ): Promise<SecurityPolicies> {
    const current = await this.get();
    const next: SecurityPolicies = {
      mfaRequired: typeof patch.mfaRequired === 'boolean' ? patch.mfaRequired : current.mfaRequired,
      sessionTimeoutHours: patch.sessionTimeoutHours !== undefined
        ? clampNumber(patch.sessionTimeoutHours, 1, 168, current.sessionTimeoutHours)
        : current.sessionTimeoutHours,
      passwordMinLength: patch.passwordMinLength !== undefined
        ? clampNumber(patch.passwordMinLength, 6, 64, current.passwordMinLength)
        : current.passwordMinLength,
      maxLoginAttempts: patch.maxLoginAttempts !== undefined
        ? clampNumber(patch.maxLoginAttempts, 3, 100, current.maxLoginAttempts)
        : current.maxLoginAttempts,
      loginAttemptWindowMin: patch.loginAttemptWindowMin !== undefined
        ? clampNumber(patch.loginAttemptWindowMin, 1, 1440, current.loginAttemptWindowMin)
        : current.loginAttemptWindowMin,
    };
    await this.prisma.globalSetting.upsert({
      where: { key: POLICY_KEY },
      update: { value: JSON.stringify(next), updatedById: actorUserId ?? undefined },
      create: { key: POLICY_KEY, value: JSON.stringify(next), description: 'Políticas de segurança do painel admin', updatedById: actorUserId ?? undefined },
    });
    return next;
  }

  /** Conveniência para gravar audit log e enforcement. */
  static defaults(): SecurityPolicies {
    return { ...DEFAULTS };
  }
}
