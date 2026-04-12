import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppConfigService } from '../../shared/config/app-config.service';
import { PaymentStatus } from '../../shared/enums/payment-status.enum';
import { RsvpStatus } from '../../shared/enums/rsvp-status.enum';
import { JwtUser } from '../../shared/interfaces/jwt-user.interface';
import { Event } from '../events/entities/event.entity';
import { Rsvp } from '../events/entities/rsvp.entity';
import { InitiatePaymentDto } from './dto/initiate-payment.dto';
import { Payment } from './entities/payment.entity';
import { Transaction } from './entities/transaction.entity';

@Injectable()
export class PaymentsService {
  constructor(
    @InjectRepository(Event)
    private readonly eventsRepository: Repository<Event>,
    @InjectRepository(Rsvp)
    private readonly rsvpRepository: Repository<Rsvp>,
    @InjectRepository(Payment)
    private readonly paymentsRepository: Repository<Payment>,
    @InjectRepository(Transaction)
    private readonly transactionsRepository: Repository<Transaction>,
    private readonly configService: AppConfigService,
  ) {}

  async initiatePayment(user: JwtUser, payload: InitiatePaymentDto) {
    const event = await this.eventsRepository.findOne({
      where: { id: payload.eventId },
    });

    if (!event) {
      throw new NotFoundException('Event not found');
    }

    if (!event.paymentRequired) {
      throw new BadRequestException('This event does not require payment');
    }

    const providerReference = `pch_${Date.now()}_${user.sub.slice(0, 8)}`;
    const payment = this.paymentsRepository.create({
      userId: user.sub,
      eventId: event.id,
      amount: event.ticketPrice,
      currency: 'MWK',
      provider: 'PAYCHANGU',
      providerReference,
      checkoutUrl: `${this.configService.payChanguConfig.baseUrl}/checkout/${providerReference}`,
      status: PaymentStatus.PENDING,
      metadata: {
        eventTitle: event.title,
        provider: 'PayChangu',
      },
    });

    const savedPayment = await this.paymentsRepository.save(payment);

    let rsvp = await this.rsvpRepository.findOne({
      where: { userId: user.sub, eventId: event.id },
    });

    if (!rsvp) {
      rsvp = this.rsvpRepository.create({
        userId: user.sub,
        eventId: event.id,
        paymentRequired: true,
        status: RsvpStatus.PENDING,
      });
      await this.rsvpRepository.save(rsvp);
    }

    return {
      paymentId: savedPayment.id,
      providerReference,
      checkoutUrl: savedPayment.checkoutUrl,
      status: savedPayment.status,
    };
  }

  async handleWebhook(
    signature: string | undefined,
    payload: Record<string, unknown>,
  ) {
    if (
      this.configService.payChanguConfig.webhookSecret &&
      signature !== this.configService.payChanguConfig.webhookSecret
    ) {
      throw new UnauthorizedException('Invalid webhook signature');
    }

    const providerReference = String(payload.reference ?? '');
    const payment = await this.paymentsRepository.findOne({
      where: { providerReference },
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    payment.status = PaymentStatus.SUCCESS;
    await this.paymentsRepository.save(payment);

    const transaction = this.transactionsRepository.create({
      paymentId: payment.id,
      webhookEvent: String(payload.event ?? 'payment.success'),
      payload,
      signature,
      isVerified: true,
    });
    await this.transactionsRepository.save(transaction);

    const rsvp = await this.rsvpRepository.findOne({
      where: {
        eventId: payment.eventId,
        userId: payment.userId,
      },
    });

    if (rsvp) {
      rsvp.status = RsvpStatus.CONFIRMED;
      rsvp.paidAt = new Date();
      await this.rsvpRepository.save(rsvp);
    }

    await this.eventsRepository.increment(
      { id: payment.eventId },
      'paymentCount',
      1,
    );
    await this.eventsRepository.increment({ id: payment.eventId }, 'rsvpCount', 1);

    return { received: true };
  }
}

