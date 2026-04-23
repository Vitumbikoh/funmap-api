import { ContentVisibility } from '../../../shared/enums/content-visibility.enum';

export class UpdatePostDto {
  caption?: string;

  mediaIds?: string[];

  visibility?: ContentVisibility;

  visibilityRadiusKm?: number;

  latitude?: number;

  longitude?: number;

  hashtags?: string[];

  moodTag?: string;

  township?: string;

  district?: string;

  region?: string;

  country?: string;
}
