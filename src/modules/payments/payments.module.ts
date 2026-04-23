import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Event } from '../events/entities/event.entity';
import { Rsvp } from '../events/entities/rsvp.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { User } from '../users/entities/user.entity';
import { Payment } from './entities/payment.entity';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { SubscriptionPricing } from './entities/subscription-pricing.entity';
import { Transaction } from './entities/transaction.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Event,
      Rsvp,
      Payment,
      Transaction,
      User,
      SubscriptionPricing,
    ]),
    NotificationsModule,
  ],
  controllers: [PaymentsController],
  providers: [PaymentsService],
  exports: [PaymentsService, TypeOrmModule],
})
export class PaymentsModule {}
