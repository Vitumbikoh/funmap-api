import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../shared/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { JwtUser } from '../../shared/interfaces/jwt-user.interface';
import { CreateUploadIntentDto } from './dto/create-upload-intent.dto';
import { MediaService } from './media.service';

@Controller('media')
@UseGuards(JwtAuthGuard)
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Get(':id')
  findOne(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.mediaService.findOneForUser(user, id);
  }

  @Post('upload-intents')
  createUploadIntent(
    @CurrentUser() user: JwtUser,
    @Body() payload: CreateUploadIntentDto,
  ) {
    return this.mediaService.createUploadIntent(user, payload);
  }

  @Post()
  registerMedia(
    @CurrentUser() user: JwtUser,
    @Body()
    payload: {
      type: CreateUploadIntentDto['type'];
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
    return this.mediaService.registerUploadedMedia(user, payload);
  }
}

