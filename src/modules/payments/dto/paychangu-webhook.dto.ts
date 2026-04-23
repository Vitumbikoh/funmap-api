import { IsObject, IsOptional, IsString } from 'class-validator';

export class PayChanguWebhookDto {
  @IsOptional()
  @IsString()
  event_type?: string;

  @IsOptional()
  @IsString()
  event?: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  payment_status?: string;

  @IsOptional()
  @IsString()
  reference?: string;

  @IsOptional()
  @IsString()
  tx_ref?: string;

  @IsOptional()
  amount?: number | string;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsObject()
  data?: Record<string, unknown>;
}
