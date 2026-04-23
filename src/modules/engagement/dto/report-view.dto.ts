import { Type } from 'class-transformer';
import { IsBoolean, IsInt, Max, Min } from 'class-validator';

export class ReportViewDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1800)
  watchTimeSeconds: number;

  @IsBoolean()
  completed: boolean;
}
