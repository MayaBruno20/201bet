import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { PrismaClientKnownRequestError, PrismaClientValidationError } from '@prisma/client/runtime/library';
import { Request, Response } from 'express';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Erro interno do servidor';
    let error: string | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'string') {
        message = res;
      } else if (typeof res === 'object' && res !== null) {
        const r = res as { message?: string | string[]; error?: string };
        message = r.message ?? message;
        error = r.error;
      }
    } else if (exception instanceof PrismaClientKnownRequestError) {
      // Prisma errors mapeados para mensagens humanas
      switch (exception.code) {
        case 'P2002':
          status = HttpStatus.CONFLICT;
          message = `Registro duplicado: já existe um item com este valor único.`;
          break;
        case 'P2003':
          status = HttpStatus.BAD_REQUEST;
          message = 'Referência inválida (chave estrangeira).';
          break;
        case 'P2025':
          status = HttpStatus.NOT_FOUND;
          message = 'Registro não encontrado.';
          break;
        case 'P2021':
          status = HttpStatus.SERVICE_UNAVAILABLE;
          message = 'Estrutura do banco está desatualizada. Execute "npm run db:push" no backend.';
          break;
        case 'P2022':
          status = HttpStatus.SERVICE_UNAVAILABLE;
          message = 'Coluna ausente no banco. Execute "npm run db:push" no backend.';
          break;
        case 'P2028':
          status = HttpStatus.REQUEST_TIMEOUT;
          message = 'A operação no banco demorou demais. Tente novamente.';
          break;
        case 'P1001':
        case 'P1002':
          status = HttpStatus.SERVICE_UNAVAILABLE;
          message = 'Não foi possível conectar ao banco de dados.';
          break;
        default:
          message = `Erro no banco de dados (${exception.code}): ${exception.message?.split('\n')[0] ?? ''}`;
      }
    } else if (exception instanceof PrismaClientValidationError) {
      status = HttpStatus.BAD_REQUEST;
      message = 'Dados inválidos para a operação no banco.';
    } else if (exception instanceof Error) {
      message = exception.message || message;
    }

    // Log no servidor para debug (mostra stack apenas em 5xx)
    if (status >= 500) {
      this.logger.error(
        `[${request.method} ${request.url}] ${exception instanceof Error ? exception.message : exception}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    response.status(status).json({
      statusCode: status,
      message,
      ...(error ? { error } : {}),
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
