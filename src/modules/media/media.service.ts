import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MediaType } from '../../shared/enums/media-type.enum';
import { JwtUser } from '../../shared/interfaces/jwt-user.interface';
import { CreateUploadIntentDto } from './dto/create-upload-intent.dto';
import { Media } from './entities/media.entity';

@Injectable()
export class MediaService {
  constructor(
    @InjectRepository(Media)
    private readonly mediaRepository: Repository<Media>,
  ) {}

  async createUploadIntent(user: JwtUser, payload: CreateUploadIntentDto) {
    const timestamp = Date.now();
    const publicId = `funmap/${payload.folder ?? 'uploads'}/${user.sub}/${timestamp}`;

    return {
      provider: 'cloudinary',
      publicId,
      resourceType: payload.type === MediaType.VIDEO ? 'video' : 'image',
      folder: payload.folder ?? 'uploads',
      relatedEntityId: payload.relatedEntityId ?? null,
    };
  }

  async registerUploadedMedia(
    user: JwtUser,
    payload: {
      type: MediaType;
      publicId: string;
      secureUrl: string;
      format?: string;
      width?: number;
      height?: number;
      bytes?: number;
      durationSeconds?: number;
      metadata?: Record<string, unknown>;
    },
  ) {
    const media = this.mediaRepository.create({
      ownerUserId: user.sub,
      type: payload.type,
      publicId: payload.publicId,
      secureUrl: payload.secureUrl,
      format: payload.format,
      width: payload.width,
      height: payload.height,
      bytes: payload.bytes,
      durationSeconds: payload.durationSeconds,
      metadata: payload.metadata ?? {},
      isProcessed: true,
    });

    return this.mediaRepository.save(media);
  }
}

