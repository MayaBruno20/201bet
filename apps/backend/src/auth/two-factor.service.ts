import { randomBytes } from 'crypto';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as OTPAuth from 'otpauth';
import * as QRCode from 'qrcode';
import { PrismaService } from '../database/prisma.service';

/**
 * Implementa TOTP (RFC 6238) para o painel admin.
 *
 * Fluxo de setup:
 *   1. POST /admin/auth/2fa/setup     → gera secret, retorna otpauth URL + QR base64.
 *      Não persiste como "enabled" ainda — só salva o secret pendente.
 *   2. POST /admin/auth/2fa/verify    → admin envia primeiro código de 6 dígitos.
 *      Se válido, marca twoFactorEnabled=true e devolve backup codes (1 vez só).
 *
 * Fluxo de login:
 *   1. POST /admin/auth/login         → senha OK + 2FA habilitado: retorna requires2FA + tempToken.
 *   2. POST /admin/auth/login/2fa     → tempToken + código TOTP (ou backup) → emite cookie admin.
 */

const TOTP_PERIOD = 30;
const TOTP_DIGITS = 6;
const TOTP_ALGORITHM = 'SHA1';
const ISSUER = '201Bet Admin';
// Janela ±1 step (~30s) para tolerar drift de relógio entre servidor e celular.
const TOTP_WINDOW = 1;
const BACKUP_CODE_COUNT = 8;
const BACKUP_CODE_LENGTH = 10; // chars hex

function makeTotp(secret: string, label: string): OTPAuth.TOTP {
  return new OTPAuth.TOTP({
    issuer: ISSUER,
    label,
    algorithm: TOTP_ALGORITHM,
    digits: TOTP_DIGITS,
    period: TOTP_PERIOD,
    secret: OTPAuth.Secret.fromBase32(secret),
  });
}

function generateBackupCodes(): string[] {
  const codes: string[] = [];
  for (let i = 0; i < BACKUP_CODE_COUNT; i += 1) {
    codes.push(randomBytes(BACKUP_CODE_LENGTH).toString('hex').slice(0, BACKUP_CODE_LENGTH).toUpperCase());
  }
  return codes;
}

@Injectable()
export class TwoFactorService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Inicia o setup de 2FA para o admin logado.
   * Gera um secret novo e retorna o otpauth URL + QR code (base64) para escanear.
   * O secret fica gravado mas twoFactorEnabled permanece false até o verify.
   */
  async setup(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, twoFactorEnabled: true },
    });
    if (!user) throw new NotFoundException('Usuário não encontrado');
    if (user.twoFactorEnabled) {
      throw new BadRequestException(
        '2FA já está ativado. Desative antes de gerar um novo secret.',
      );
    }

    const secret = new OTPAuth.Secret({ size: 20 });
    const secretBase32 = secret.base32;
    const totp = makeTotp(secretBase32, user.email);
    const otpauthUrl = totp.toString();
    const qrPng = await QRCode.toDataURL(otpauthUrl, { errorCorrectionLevel: 'M', margin: 1, scale: 6 });

    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorSecret: secretBase32, twoFactorEnabled: false, twoFactorBackupCodes: [] },
    });

    return { otpauthUrl, qrPng, secret: secretBase32 };
  }

  /**
   * Verifica o primeiro código TOTP enviado pelo admin e ativa 2FA.
   * Retorna backup codes em texto puro UMA ÚNICA VEZ — depois disso só hashes ficam.
   */
  async verify(userId: string, code: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, twoFactorSecret: true, twoFactorEnabled: true },
    });
    if (!user) throw new NotFoundException('Usuário não encontrado');
    if (!user.twoFactorSecret) {
      throw new BadRequestException('Inicie o setup com /2fa/setup antes.');
    }
    if (user.twoFactorEnabled) {
      throw new BadRequestException('2FA já está ativado.');
    }

    const totp = makeTotp(user.twoFactorSecret, user.email);
    const delta = totp.validate({ token: code.trim(), window: TOTP_WINDOW });
    if (delta === null) {
      throw new UnauthorizedException('Código inválido. Verifique o relógio do seu celular.');
    }

    const backupCodes = generateBackupCodes();
    const hashed = await Promise.all(backupCodes.map((c) => bcrypt.hash(c, 10)));

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        twoFactorEnabled: true,
        twoFactorBackupCodes: hashed,
      },
    });

    return { backupCodes }; // ÚNICA OPORTUNIDADE de mostrar — depois só os hashes ficam
  }

  /**
   * Desativa 2FA. Requer senha + código TOTP atual (defesa contra sequestro de sessão).
   */
  async disable(userId: string, password: string, code: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, password: true, twoFactorSecret: true, twoFactorEnabled: true },
    });
    if (!user) throw new NotFoundException('Usuário não encontrado');
    if (!user.twoFactorEnabled || !user.twoFactorSecret) {
      throw new BadRequestException('2FA não está ativado.');
    }

    const passwordOk = await bcrypt.compare(password, user.password);
    if (!passwordOk) throw new UnauthorizedException('Senha incorreta.');

    const totp = makeTotp(user.twoFactorSecret, user.email);
    const delta = totp.validate({ token: code.trim(), window: TOTP_WINDOW });
    if (delta === null) {
      throw new UnauthorizedException('Código inválido.');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: false, twoFactorSecret: null, twoFactorBackupCodes: [] },
    });

    return { ok: true };
  }

  /**
   * Valida um código TOTP OU um backup code para um user. Usado durante o login admin.
   * Se for backup code, consome (remove da lista).
   * Retorna true se válido.
   */
  async validateLoginChallenge(userId: string, code: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, twoFactorSecret: true, twoFactorEnabled: true, twoFactorBackupCodes: true },
    });
    if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) return false;

    const trimmed = code.trim();

    // 1) Tenta como TOTP de 6 dígitos.
    if (/^\d{6}$/.test(trimmed)) {
      const totp = makeTotp(user.twoFactorSecret, user.email);
      const delta = totp.validate({ token: trimmed, window: TOTP_WINDOW });
      if (delta !== null) return true;
    }

    // 2) Tenta como backup code (consome se válido).
    const upperCode = trimmed.toUpperCase();
    for (let i = 0; i < user.twoFactorBackupCodes.length; i += 1) {
      const match = await bcrypt.compare(upperCode, user.twoFactorBackupCodes[i]);
      if (match) {
        const remaining = [...user.twoFactorBackupCodes];
        remaining.splice(i, 1);
        await this.prisma.user.update({
          where: { id: userId },
          data: { twoFactorBackupCodes: remaining },
        });
        return true;
      }
    }

    return false;
  }

  /**
   * Regenera backup codes (admin pode acionar quando perde a lista).
   * Requer 2FA já ativo + código TOTP atual válido.
   */
  async regenerateBackupCodes(userId: string, code: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, twoFactorSecret: true, twoFactorEnabled: true },
    });
    if (!user) throw new NotFoundException('Usuário não encontrado');
    if (!user.twoFactorEnabled || !user.twoFactorSecret) {
      throw new BadRequestException('2FA não está ativado.');
    }

    const totp = makeTotp(user.twoFactorSecret, user.email);
    const delta = totp.validate({ token: code.trim(), window: TOTP_WINDOW });
    if (delta === null) throw new UnauthorizedException('Código inválido.');

    const backupCodes = generateBackupCodes();
    const hashed = await Promise.all(backupCodes.map((c) => bcrypt.hash(c, 10)));
    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorBackupCodes: hashed },
    });

    return { backupCodes };
  }
}
