import {
  Body,
  Controller,
  Get,
  Headers,
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
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { JwtUser } from '../../shared/interfaces/jwt-user.interface';
import { InitiatePaymentDto } from './dto/initiate-payment.dto';
import { PayChanguWebhookDto } from './dto/paychangu-webhook.dto';
import { PaymentsService } from './payments.service';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

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

