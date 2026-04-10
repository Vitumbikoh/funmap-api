import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AppConfigService } from '../../shared/config/app-config.service';
import { NotificationType } from '../../shared/enums/notification-type.enum';
import { PaymentStatus } from '../../shared/enums/payment-status.enum';
import { RsvpStatus } from '../../shared/enums/rsvp-status.enum';
import { JwtUser } from '../../shared/interfaces/jwt-user.interface';
import { Event } from '../events/entities/event.entity';
import { NotificationsService } from '../notifications/notifications.service';
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
    private readonly notificationsService: NotificationsService,
    private readonly dataSource: DataSource,
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

    const providerReference = String(payload.reference ?? '').trim();
    if (!providerReference) {
      throw new BadRequestException('Missing payment reference');
    }

    const rawStatus = String(payload.status ?? payload.payment_status ?? '').toLowerCase();
    const webhookEvent = String(payload.event ?? 'payment.updated');
    const isSuccessEvent =
      rawStatus === 'success' ||
      rawStatus === 'successful' ||
      webhookEvent.toLowerCase().includes('success');

    const result = await this.dataSource.transaction(async (manager) => {
      const paymentRepo = manager.getRepository(Payment);
      const transactionRepo = manager.getRepository(Transaction);
      const rsvpRepo = manager.getRepository(Rsvp);
      const eventRepo = manager.getRepository(Event);

      const payment = await paymentRepo.findOne({
        where: { providerReference },
      });

      if (!payment) {
        throw new NotFoundException('Payment not found');
      }

      const previousStatus = payment.status;
      const nextStatus = isSuccessEvent ? PaymentStatus.SUCCESS : PaymentStatus.FAILED;

      if (previousStatus !== nextStatus) {
        payment.status = nextStatus;
        await paymentRepo.save(payment);
      }

      const transaction = transactionRepo.create({
        paymentId: payment.id,
        webhookEvent,
        payload,
        signature,
        isVerified: true,
      });
      await transactionRepo.save(transaction);

      if (isSuccessEvent && previousStatus !== PaymentStatus.SUCCESS) {
        const rsvp = await rsvpRepo.findOne({
          where: {
            eventId: payment.eventId,
            userId: payment.userId,
          },
        });

        if (rsvp && rsvp.status !== RsvpStatus.CONFIRMED) {
          rsvp.status = RsvpStatus.CONFIRMED;
          rsvp.paidAt = new Date();
          await rsvpRepo.save(rsvp);
          await eventRepo.increment({ id: payment.eventId }, 'rsvpCount', 1);
        }

        await eventRepo.increment({ id: payment.eventId }, 'paymentCount', 1);
      }

      return {
        paymentId: payment.id,
        eventId: payment.eventId,
        userId: payment.userId,
        status: nextStatus,
      };
    });

    await this.notificationsService.createNotification(
      result.userId,
      NotificationType.PAYMENT,
      result.status === PaymentStatus.SUCCESS
        ? 'Payment confirmed'
        : 'Payment update',
      result.status === PaymentStatus.SUCCESS
        ? 'Your payment was verified and event access is now unlocked.'
        : 'Your payment could not be verified yet. Please try again.',
      {
        paymentId: result.paymentId,
        eventId: result.eventId,
        status: result.status,
        providerReference,
      },
    );

    return { received: true, status: result.status };
  }
}

