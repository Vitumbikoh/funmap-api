import { IsBoolean } from 'class-validator';

export class ApproveCommunityEventDto {
  @IsBoolean()
  approved: boolean;
}
