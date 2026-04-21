import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseEnumPipe,
  Patch,
  Query,
  Post,
  RawBodyRequest,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { Response } from 'express';
import { CurrentUser } from '../../shared/decorators/current-user.decorator';
import { Roles } from '../../shared/decorators/roles.decorator';
import { PricingAudience } from '../../shared/enums/pricing-audience.enum';
import { Role } from '../../shared/enums/role.enum';
import { SubscriptionPlan } from '../../shared/enums/subscription-plan.enum';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../shared/guards/roles.guard';
import { JwtUser } from '../../shared/interfaces/jwt-user.interface';
import { InitiatePaymentDto } from './dto/initiate-payment.dto';
import { InitiateSubscriptionPaymentDto } from './dto/initiate-subscription-payment.dto';
import { PayChanguWebhookDto } from './dto/paychangu-webhook.dto';
import { UpdateSubscriptionPricingDto } from './dto/update-subscription-pricing.dto';
import { PaymentsService } from './payments.service';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get('app-usage-fee')
  @UseGuards(JwtAuthGuard)
  getMyAppUsageFee(@CurrentUser() user: JwtUser) {
    return this.paymentsService.getCurrentUserAppUsageFee(user.sub);
  }

  @Post('subscription-checkout')
  @UseGuards(JwtAuthGuard)
  initiateSubscriptionCheckout(
    @CurrentUser() user: JwtUser,
    @Body() payload: InitiateSubscriptionPaymentDto,
  ) {
    return this.paymentsService.initiateSubscriptionCheckout(user, payload);
  }

  @Get('subscription-pricing-catalog')
  @UseGuards(JwtAuthGuard)
  getMySubscriptionPricingCatalog(@CurrentUser() user: JwtUser) {
    return this.paymentsService.getSubscriptionPricingCatalogForUser(user.sub);
  }

  @Get('admin/subscription-pricing')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  listSubscriptionPricingForAdmin() {
    return this.paymentsService.listSubscriptionPricingForAdmin();
  }

  @Patch('admin/subscription-pricing/:audience/:plan')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  updateSubscriptionPricingForAdmin(
    @CurrentUser() user: JwtUser,
    @Param('audience', new ParseEnumPipe(PricingAudience))
    audience: PricingAudience,
    @Param('plan', new ParseEnumPipe(SubscriptionPlan)) plan: SubscriptionPlan,
    @Body() payload: UpdateSubscriptionPricingDto,
  ) {
    return this.paymentsService.updateSubscriptionPricingForAdmin(
      user.sub,
      audience,
      plan,
      payload,
    );
  }

  @Get('admin/ledger')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  listAdminPaymentLedger(@Query('limit') limit?: string) {
    return this.paymentsService.listAdminPaymentLedger(limit ? Number(limit) : 50);
  }

  @Post('event-checkout')
  @UseGuards(JwtAuthGuard)
  initiateEventPayment(
    @CurrentUser() user: JwtUser,
    @Body() payload: InitiatePaymentDto,
  ) {
    return this.paymentsService.initiatePayment(user, payload);
  }

  @Post('paychangu/webhook')
  handleWebhook(
    @Headers('signature') signature: string | undefined,
    @Headers('x-paychangu-signature') xPayChanguSignature: string | undefined,
    @Body() payload: PayChanguWebhookDto,
    @Req() request: RawBodyRequest<Request>,
  ) {
    return this.paymentsService.handleWebhook({
      signature: signature ?? xPayChanguSignature,
      payload,
      rawBody: request.rawBody,
      headers: request.headers,
    });
  }

  @Get('paychangu/callback')
  async handlePayChanguCallback(
    @Res() response: Response,
    @Query('tx_ref') txRef?: string,
    @Query('status') status?: string,
  ) {
    const result = await this.paymentsService.handleRedirectResult(
      'callback',
      txRef,
      status,
    );

    return response.redirect(302, result.redirectUrl);
  }

  @Get('paychangu/return')
  async handlePayChanguReturn(
    @Res() response: Response,
    @Query('tx_ref') txRef?: string,
    @Query('status') status?: string,
  ) {
    const result = await this.paymentsService.handleRedirectResult(
      'return',
      txRef,
      status,
    );

    return response.redirect(302, result.redirectUrl);
  }
}

