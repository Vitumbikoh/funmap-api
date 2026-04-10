import { ArrayMaxSize, IsArray, IsOptional, IsUUID } from 'class-validator';

export class MarkNotificationsReadDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID('4', { each: true })
  ids?: string[];
}
