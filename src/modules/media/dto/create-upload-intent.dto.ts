import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { MediaType } from '../../../shared/enums/media-type.enum';

export class CreateUploadIntentDto {
  @IsEnum(MediaType)
  type: MediaType;

  @IsOptional()
  @IsString()
  folder?: string;

  @IsOptional()
  @IsUUID()
  relatedEntityId?: string;
}

