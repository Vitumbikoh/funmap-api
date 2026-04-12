import { Body, Controller, Headers, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../shared/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { JwtUser } from '../../shared/interfaces/jwt-user.interface';
import { InitiatePaymentDto } from './dto/initiate-payment.dto';
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

  @Post('webhook/paychangu')
  handleWebhook(
    @Headers('x-paychangu-signature') signature: string | undefined,
    @Body() payload: Record<string, unknown>,
  ) {
    return this.paymentsService.handleWebhook(signature, payload);
  }
}

