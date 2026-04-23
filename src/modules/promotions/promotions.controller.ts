import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../shared/decorators/current-user.decorator';
import { Roles } from '../../shared/decorators/roles.decorator';
import { Role } from '../../shared/enums/role.enum';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../shared/guards/roles.guard';
import { JwtUser } from '../../shared/interfaces/jwt-user.interface';
import { CreatePromotionDto } from './dto/create-promotion.dto';
import { ListPromotionsQueryDto } from './dto/list-promotions-query.dto';
import { UpdatePromotionStatusDto } from './dto/update-promotion-status.dto';
import { PromotionsService } from './promotions.service';

@Controller('promotions')
@UseGuards(JwtAuthGuard)
export class PromotionsController {
  constructor(private readonly promotionsService: PromotionsService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.CAPITAL_USER, Role.ADMIN)
  create(@CurrentUser() user: JwtUser, @Body() payload: CreatePromotionDto) {
    return this.promotionsService.create(user, payload);
  }

  @Get('mine')
  listMine(@CurrentUser() user: JwtUser, @Query() query: ListPromotionsQueryDto) {
    return this.promotionsService.listMine(user, query);
  }

  @Patch(':id/status')
  @UseGuards(RolesGuard)
  @Roles(Role.CAPITAL_USER, Role.ADMIN)
  updateStatus(
    @CurrentUser() user: JwtUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() payload: UpdatePromotionStatusDto,
  ) {
    return this.promotionsService.updateStatus(user, id, payload);
  }

  @Patch('sync/expire')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  syncExpired() {
    return this.promotionsService.syncExpiredPromotions();
  }
}