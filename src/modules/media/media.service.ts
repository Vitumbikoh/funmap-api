import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { Repository } from 'typeorm';
import { AppConfigService } from '../../shared/config/app-config.service';
import { MediaType } from '../../shared/enums/media-type.enum';
import { JwtUser } from '../../shared/interfaces/jwt-user.interface';
import { CreateUploadIntentDto } from './dto/create-upload-intent.dto';
import { Media } from './entities/media.entity';

@Injectable()
export class MediaService {
  constructor(
    @InjectRepository(Media)
    private readonly mediaRepository: Repository<Media>,
    private readonly configService: AppConfigService,
  ) {}

  async createUploadIntent(user: JwtUser, payload: CreateUploadIntentDto) {
    const timestamp = Math.floor(Date.now() / 1000);
    const publicId = `funmap/${payload.folder ?? 'uploads'}/${user.sub}/${timestamp}`;
    const folder = payload.folder ?? 'uploads';
    const resourceType = payload.type === MediaType.VIDEO ? 'video' : 'image';

    const cloudinary = this.configService.cloudinaryConfig;

    let signedUpload: {
      uploadUrl: string;
      apiKey: string;
      timestamp: number;
      signature: string;
    } | null = null;

    if (cloudinary.cloudName && cloudinary.apiKey && cloudinary.apiSecret) {
      const signaturePayload = `folder=${folder}&public_id=${publicId}&timestamp=${timestamp}`;
      const signature = createHash('sha1')
        .update(`${signaturePayload}${cloudinary.apiSecret}`)
        .digest('hex');

      signedUpload = {
        uploadUrl: `https://api.cloudinary.com/v1_1/${cloudinary.cloudName}/${resourceType}/upload`,
        apiKey: cloudinary.apiKey,
        timestamp,
        signature,
      };
    }

    return {
      provider: 'cloudinary',
      publicId,
      resourceType,
      folder,
      relatedEntityId: payload.relatedEntityId ?? null,
      signedUpload,
    };
  }

  async findOneForUser(_user: JwtUser, id: string) {
    return this.mediaRepository.findOne({ where: { id } });
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

