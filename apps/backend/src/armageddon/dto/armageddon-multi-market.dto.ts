import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * Criação de multi-mercado (pari-mutuel N opções) de um evento Armageddon.
 * As opções vêm do roster: por padrão TODOS os pilotos; `driverIds` permite
 * restringir (ex.: mercado de campeão só com o Top 32 do 2º sorteio).
 */
export class CreateArmageddonMultiMarketDto {
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  name: string;

  /**
   * Tipos suportados pelo motor multi-runner.
   * WINNER = campeão (1 vencedor). QUALIFY = classificados ao resorteio
   * (multi-vencedor, apurado automaticamente pelo chaveamento).
   */
  @IsIn(['WINNER', 'QUALIFY', 'BEST_REACTION', 'FALSE_START'])
  type: 'WINNER' | 'QUALIFY' | 'BEST_REACTION' | 'FALSE_START';

  @IsOptional()
  @IsArray()
  @ArrayMinSize(2)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  driverIds?: string[];

  @IsOptional()
  @IsDateString()
  bookingCloseAt?: string;

  /** Fecha automaticamente quando a semifinal abrir (2º/3º do Leva Tudo). */
  @IsOptional()
  @IsBoolean()
  autoCloseAtSemifinal?: boolean;

  /**
   * Papel no pódio do Leva Tudo. Habilita o auto-fechamento e a auto-liquidação:
   * CHAMPION paga o vencedor da Grande Final; RUNNER_UP paga o vice (perdedor da
   * final); THIRD paga o vencedor do embate de 3º lugar. Ausente = sem automação.
   */
  @IsOptional()
  @IsIn(['CHAMPION', 'RUNNER_UP', 'THIRD'])
  championRole?: 'CHAMPION' | 'RUNNER_UP' | 'THIRD';
}
