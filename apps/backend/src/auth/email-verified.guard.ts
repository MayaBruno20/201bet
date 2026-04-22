import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

export interface AuthenticatedRequestUser {
  userId: string;
  email: string;
  role: string;
  emailVerified: boolean;
}

@Injectable()
export class EmailVerifiedGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      user?: AuthenticatedRequestUser;
    }>();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Sessão inválida');
    }

    if (!user.emailVerified) {
      throw new ForbiddenException({
        code: 'EMAIL_NOT_VERIFIED',
        message:
          'Confirme seu e-mail para liberar depósitos, saques e apostas.',
      });
    }

    return true;
  }
}
