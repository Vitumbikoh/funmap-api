import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../shared/decorators/current-user.decorator';
import { PaginationQueryDto } from '../../shared/dto/pagination-query.dto';
import { ContentTarget } from '../../shared/enums/content-target.enum';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { JwtUser } from '../../shared/interfaces/jwt-user.interface';
import { AddCommentDto } from './dto/add-comment.dto';
import { ReportViewDto } from './dto/report-view.dto';
import { ShareTargetDto } from './dto/share-target.dto';
import { EngagementService } from './engagement.service';

@Controller('engagement')
@UseGuards(JwtAuthGuard)
export class EngagementController {
  constructor(private readonly engagementService: EngagementService) {}

  @Post(':targetType/:targetId/like')
  like(
    @CurrentUser() user: JwtUser,
    @Param('targetType') targetType: string,
    @Param('targetId') targetId: string,
  ) {
    return this.engagementService.like(
      user,
      this.parseTargetType(targetType),
      targetId,
    );
  }

  @Delete(':targetType/:targetId/like')
  unlike(
    @CurrentUser() user: JwtUser,
    @Param('targetType') targetType: string,
    @Param('targetId') targetId: string,
  ) {
    return this.engagementService.unlike(
      user,
      this.parseTargetType(targetType),
      targetId,
    );
  }

  @Post(':targetType/:targetId/comments')
  addComment(
    @CurrentUser() user: JwtUser,
    @Param('targetType') targetType: string,
    @Param('targetId') targetId: string,
    @Body() payload: AddCommentDto,
  ) {
    return this.engagementService.addComment(
      user,
      this.parseTargetType(targetType),
      targetId,
      payload,
    );
  }

  @Get(':targetType/:targetId/comments')
  listComments(
    @Param('targetType') targetType: string,
    @Param('targetId') targetId: string,
    @Query() query: PaginationQueryDto,
  ) {
    return this.engagementService.listComments(
      this.parseTargetType(targetType),
      targetId,
      query,
    );
  }

  @Post(':targetType/:targetId/share')
  share(
    @CurrentUser() user: JwtUser,
    @Param('targetType') targetType: string,
    @Param('targetId') targetId: string,
    @Body() payload: ShareTargetDto,
  ) {
    return this.engagementService.share(
      user,
      this.parseTargetType(targetType),
      targetId,
      payload,
    );
  }

  @Post(':targetType/:targetId/view')
  reportView(
    @CurrentUser() user: JwtUser,
    @Param('targetType') targetType: string,
    @Param('targetId') targetId: string,
    @Body() payload: ReportViewDto,
  ) {
    return this.engagementService.reportView(
      user,
      this.parseTargetType(targetType),
      targetId,
      payload,
    );
  }

  private parseTargetType(targetType: string): ContentTarget {
    const upperType = targetType.toUpperCase();

    if (!Object.values(ContentTarget).includes(upperType as ContentTarget)) {
      throw new BadRequestException('Invalid target type');
    }

    return upperType as ContentTarget;
  }
}
