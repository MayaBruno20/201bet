import { IsBoolean, IsDateString, IsEnum, IsOptional, IsString, IsUrl, MaxLength, MinLength } from 'class-validator';

export enum ListEventTypeDto {
  REGULAR = 'REGULAR',
  ARMAGEDDON = 'ARMAGEDDON',
  SHARK_TANK = 'SHARK_TANK',
}

export class CreateListEventDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  @IsDateString()
  scheduledAt: string;

  @IsOptional()
  @IsDateString()
  endsAt?: string;

  @IsOptional()
  @IsEnum(ListEventTypeDto)
  type?: ListEventTypeDto;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(2048)
  bannerUrl?: string;

  @IsOptional()
  @IsBoolean()
  featured?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
