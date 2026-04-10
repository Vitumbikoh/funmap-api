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
import { CreateReportDto } from './dto/create-report.dto';
import { BulkResolveReportsDto } from './dto/bulk-resolve-reports.dto';
import { ListReportsQueryDto } from './dto/list-reports-query.dto';
import { ResolveReportDto } from './dto/resolve-report.dto';
import { ModerationService } from './moderation.service';

@Controller('moderation')
@UseGuards(JwtAuthGuard)
export class ModerationController {
  constructor(private readonly moderationService: ModerationService) {}

  @Post('reports')
  createReport(@CurrentUser() user: JwtUser, @Body() payload: CreateReportDto) {
    return this.moderationService.createReport(user, payload);
  }

  @Get('reports/mine')
  listOwnReports(@CurrentUser() user: JwtUser, @Query() query: ListReportsQueryDto) {
    return this.moderationService.listOwnReports(user, query);
  }

  @Get('reports')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  listReports(@Query() query: ListReportsQueryDto) {
    return this.moderationService.listReports(query);
  }

  @Get('reports/summary')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  getSummary() {
    return this.moderationService.getSummary();
  }

  @Patch('reports/:id/resolve')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  resolveReport(
    @CurrentUser() adminUser: JwtUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() payload: ResolveReportDto,
  ) {
    return this.moderationService.resolveReport(adminUser, id, payload);
  }

  @Patch('reports/resolve-bulk')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  resolveReportsBulk(
    @CurrentUser() adminUser: JwtUser,
    @Body() payload: BulkResolveReportsDto,
  ) {
    return this.moderationService.resolveReportsBulk(adminUser, payload);
  }
}
