import { IsEnum, IsOptional, IsString, Matches } from 'class-validator';

export enum AnalyticsExportType {
  USERS = 'users',
  EVENTS = 'events',
  BETS = 'bets',
  TRANSACTIONS = 'transactions',
}

export enum AnalyticsExportFormat {
  JSON = 'json',
  CSV = 'csv',
}

export class AnalyticsExportQueryDto {
  @IsEnum(AnalyticsExportType)
  type: AnalyticsExportType;

  @IsOptional()
  @IsEnum(AnalyticsExportFormat)
  format?: AnalyticsExportFormat;

  @IsOptional()
  @IsString()
  @Matches(/^\d+$/)
  limit?: string;
}
