import { IsOptional, IsString, MaxLength } from 'class-validator';

/** Define o rival (RIGHT) de um desafio da Fase Final do Shark Tank. */
export class SetChallengeOpponentDto {
  @IsOptional()
  @IsString()
  driverId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  driverName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  driverNickname?: string;
}
