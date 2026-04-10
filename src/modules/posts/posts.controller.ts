import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post as HttpPost,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../shared/decorators/current-user.decorator';
import { GeoQueryDto } from '../../shared/dto/geo-query.dto';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { JwtUser } from '../../shared/interfaces/jwt-user.interface';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { PostsService } from './posts.service';

@Controller('posts')
export class PostsController {
  constructor(private readonly postsService: PostsService) {}

  @Get('nearby')
  findNearby(@Query() query: GeoQueryDto) {
    return this.postsService.findNearby(query);
  }

  @HttpPost()
  @UseGuards(JwtAuthGuard)
  create(@CurrentUser() user: JwtUser, @Body() payload: CreatePostDto) {
    return this.postsService.create(user, payload);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard)
  update(
    @CurrentUser() user: JwtUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() payload: UpdatePostDto,
  ) {
    return this.postsService.update(user, id, payload);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  remove(
    @CurrentUser() user: JwtUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.postsService.remove(user, id);
  }
}

