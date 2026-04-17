import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { IncomingHttpHeaders } from 'node:http';
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
import { User } from '../users/entities/user.entity';
import { InitiatePaymentDto } from './dto/initiate-payment.dto';
import {
  PayChanguVerifyDataDto,
  PayChanguVerifyResponseDto,
} from './dto/paychangu-verify-response.dto';
import { PayChanguWebhookDto } from './dto/paychangu-webhook.dto';
import { Payment } from './entities/payment.entity';
import { Transaction } from './entities/transaction.entity';

type WebhookContext = {
  signature: string | undefined;
  payload: PayChanguWebhookDto;
  rawBody?: Buffer;
  headers: IncomingHttpHeaders;
};

type PayChanguInitiateResponse = {
  status?: string;
  message?: string;
  data?: {
    checkout_url?: string;
    data?: {
      tx_ref?: string;
      status?: string;
    };
  };
};

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @InjectRepository(Event)
    private readonly eventsRepository: Repository<Event>,
    @InjectRepository(Rsvp)
    private readonly rsvpRepository: Repository<Rsvp>,
    @InjectRepository(Payment)
    private readonly paymentsRepository: Repository<Payment>,
    @InjectRepository(Transaction)
    private readonly transactionsRepository: Repository<Transaction>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
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

    const txRef = `pch_${Date.now()}_${user.sub.slice(0, 8)}`;
    const checkoutSession = await this.createPayChanguCheckoutSession(user, event, txRef);

    const payment = this.paymentsRepository.create({
      userId: user.sub,
      eventId: event.id,
      amount: event.ticketPrice,
      currency: 'MWK',
      provider: 'PAYCHANGU',
      reference: txRef,
      providerReference: null,
      checkoutUrl: checkoutSession.checkoutUrl,
      status: PaymentStatus.PENDING,
      metadata: {
        eventTitle: event.title,
        provider: 'PayChangu',
        payChanguStatus: checkoutSession.status,
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
      providerReference: savedPayment.reference,
      checkoutUrl: savedPayment.checkoutUrl,
      status: savedPayment.status,
    };
  }

  async handleWebhook(context: WebhookContext) {
    const payloadRaw = this.resolvePayloadRaw(context.rawBody, context.payload);
    const signature = this.resolveSignature(context.signature, context.headers);
    this.assertValidWebhookSignature(signature, payloadRaw);

    const webhookPayload = this.extractWebhookPayload(context.payload);
    if (!webhookPayload.reference) {
      throw new BadRequestException('Missing payment reference');
    }

    if (!webhookPayload.txRef) {
      throw new BadRequestException('Missing tx_ref in webhook payload');
    }

    const verification = await this.verifyTransactionWithPayChangu(webhookPayload.txRef);
    const verificationData = verification.data;
    if (!verificationData) {
      throw new BadGatewayException('Missing PayChangu verification data');
    }

    const isVerifiedSuccess =
      this.isSuccessStatus(verification.status) &&
      this.isSuccessStatus(verificationData.status);

    const result = await this.dataSource.transaction(async (manager) => {
      const paymentRepo = manager.getRepository(Payment);
      const transactionRepo = manager.getRepository(Transaction);
      const rsvpRepo = manager.getRepository(Rsvp);
      const eventRepo = manager.getRepository(Event);

      let payment = await paymentRepo.findOne({
        where: { reference: webhookPayload.reference },
        lock: { mode: 'pessimistic_write' },
      });

      if (!payment) {
        payment = await paymentRepo.findOne({
          where: { providerReference: webhookPayload.reference },
          lock: { mode: 'pessimistic_write' },
        });
      }

      if (!payment) {
        payment = await paymentRepo.findOne({
          where: { reference: webhookPayload.txRef },
          lock: { mode: 'pessimistic_write' },
        });
      }

      if (!payment) {
        payment = await paymentRepo.findOne({
          where: { providerReference: webhookPayload.txRef },
          lock: { mode: 'pessimistic_write' },
        });
      }

      if (!payment) {
        throw new NotFoundException('Payment not found');
      }

      let shouldSavePayment = false;
      if (!payment.reference) {
        payment.reference = webhookPayload.txRef;
        shouldSavePayment = true;
      }

      const verificationReference = this.asString(verificationData.reference);
      if (
        verificationReference &&
        (!payment.providerReference || payment.providerReference !== verificationReference)
      ) {
        payment.providerReference = verificationReference;
        shouldSavePayment = true;
      }

      this.assertVerificationMatchesPayment(payment, webhookPayload, verificationData);

      const stableReference = payment.reference ?? webhookPayload.txRef;
      const idempotencyKey = this.buildIdempotencyKey(
        stableReference,
        webhookPayload.txRef,
        webhookPayload.eventType,
        verificationData.status,
      );

      const alreadyProcessed = await transactionRepo.findOne({
        where: { idempotencyKey },
      });

      if (alreadyProcessed) {
        this.logger.log(
          `Duplicate webhook ignored for reference ${stableReference} with key ${idempotencyKey}`,
        );

        return {
          paymentId: payment.id,
          eventId: payment.eventId,
          userId: payment.userId,
          status: payment.status,
          idempotent: true,
          statusChanged: false,
        };
      }

      const previousStatus = payment.status;
      const nextStatus = isVerifiedSuccess ? PaymentStatus.SUCCESS : PaymentStatus.FAILED;

      if (previousStatus !== nextStatus) {
        payment.status = nextStatus;
        shouldSavePayment = true;
      }

      if (shouldSavePayment) {
        await paymentRepo.save(payment);
      }

      const transaction = transactionRepo.create({
        paymentId: payment.id,
        webhookEvent: webhookPayload.eventType,
        txRef: webhookPayload.txRef,
        reference: webhookPayload.reference,
        idempotencyKey,
        payload: this.toRecord(context.payload),
        verificationPayload: this.toRecord(verification),
        signature,
        isVerified: isVerifiedSuccess,
      });
      await transactionRepo.save(transaction);

      if (nextStatus === PaymentStatus.SUCCESS && previousStatus !== PaymentStatus.SUCCESS) {
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
        idempotent: false,
        statusChanged: previousStatus !== nextStatus,
      };
    });

    if (result.statusChanged && !result.idempotent) {
      await this.notificationsService.createNotification(
        result.userId,
        NotificationType.PAYMENT,
        result.status === PaymentStatus.SUCCESS
          ? 'Payment confirmed'
          : 'Payment update',
        result.status === PaymentStatus.SUCCESS
          ? 'Your payment was verified and event access is now unlocked.'
          : 'Your payment was not successful. Please try again.',
        {
          paymentId: result.paymentId,
          eventId: result.eventId,
          status: result.status,
        },
      );
    }

    return { received: true, status: result.status, idempotent: result.idempotent };
  }

  async handleRedirectResult(
    source: 'callback' | 'return',
    txRef?: string,
    status?: string,
  ) {
    let resolvedStatus = (status ?? '').toUpperCase();
    let eventId: string | null = null;

    if (txRef) {
      const syncResult = await this.syncPaymentFromRedirect(txRef, source, status);
      if (syncResult) {
        resolvedStatus = syncResult.status;
        eventId = syncResult.eventId;
      }
    }

    const redirectUrl = this.buildMobilePaymentDeepLink(
      source,
      txRef,
      resolvedStatus,
      eventId,
    );

    return {
      received: true,
      source,
      txRef: txRef ?? null,
      status: resolvedStatus || null,
      eventId,
      redirectUrl,
      message:
        source === 'callback'
          ? 'PayChangu payment callback received.'
          : 'PayChangu payment return received.',
    };
  }

  private async syncPaymentFromRedirect(
    txRef: string,
    source: 'callback' | 'return',
    status?: string,
  ): Promise<{ status: string; eventId: string | null } | null> {
    const safeTxRef = txRef.trim();
    if (!safeTxRef) {
      return null;
    }

    let verification: PayChanguVerifyResponseDto | null = null;
    try {
      verification = await this.verifyTransactionWithPayChangu(safeTxRef);
    } catch (error) {
      this.logger.warn(
        `Redirect verification failed for tx_ref ${safeTxRef}: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    }

    const verifiedStatus = this.asString(verification?.data?.status);
    const fallbackStatus = this.asString(status);
    const normalized = (verifiedStatus ?? fallbackStatus ?? 'pending').toUpperCase();

    const updated = await this.dataSource.transaction(async (manager) => {
      const paymentRepo = manager.getRepository(Payment);
      const transactionRepo = manager.getRepository(Transaction);
      const rsvpRepo = manager.getRepository(Rsvp);
      const eventRepo = manager.getRepository(Event);

      const verificationReference = this.asString(verification?.data?.reference);
      let payment = await paymentRepo.findOne({ where: { reference: safeTxRef } });

      if (!payment) {
        payment = await paymentRepo.findOne({ where: { providerReference: safeTxRef } });
      }

      if (!payment && verificationReference) {
        payment = await paymentRepo.findOne({ where: { providerReference: verificationReference } });
      }

      if (!payment) {
        return null;
      }

      const idempotencyKey = this.buildIdempotencyKey(
        payment.reference ?? safeTxRef,
        safeTxRef,
        `redirect.${source}`,
        normalized,
      );

      const duplicate = await transactionRepo.findOne({ where: { idempotencyKey } });
      if (duplicate) {
        return {
          status: payment.status,
          eventId: payment.eventId,
        };
      }

      let shouldSavePayment = false;
      if (!payment.reference) {
        payment.reference = safeTxRef;
        shouldSavePayment = true;
      }

      if (
        verificationReference &&
        (!payment.providerReference || payment.providerReference !== verificationReference)
      ) {
        payment.providerReference = verificationReference;
        shouldSavePayment = true;
      }

      const nextStatus = this.isSuccessStatus(normalized)
        ? PaymentStatus.SUCCESS
        : this.isFailureStatus(normalized)
          ? PaymentStatus.FAILED
          : payment.status;

      const previousStatus = payment.status;
      if (previousStatus !== nextStatus) {
        payment.status = nextStatus;
        shouldSavePayment = true;
      }

      if (shouldSavePayment) {
        await paymentRepo.save(payment);
      }

      await transactionRepo.save(
        transactionRepo.create({
          paymentId: payment.id,
          webhookEvent: `redirect.${source}`,
          txRef: safeTxRef,
          reference: verificationReference ?? safeTxRef,
          idempotencyKey,
          payload: {
            source,
            tx_ref: safeTxRef,
            status: normalized,
          },
          verificationPayload: this.toRecord(verification),
          signature: null,
          isVerified: this.isSuccessStatus(normalized),
        }),
      );

      if (nextStatus === PaymentStatus.SUCCESS && previousStatus !== PaymentStatus.SUCCESS) {
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
        status: payment.status,
        eventId: payment.eventId,
      };
    });

    if (!updated) {
      return null;
    }

    return {
      status: updated.status,
      eventId: updated.eventId,
    };
  }

  private buildMobilePaymentDeepLink(
    source: 'callback' | 'return',
    txRef?: string,
    status?: string,
    eventId?: string | null,
  ): string {
    const query: Record<string, string> = {
      source,
    };

    if (txRef && txRef.trim().length > 0) {
      query.tx_ref = txRef.trim();
    }

    if (status && status.trim().length > 0) {
      query.status = status.trim().toUpperCase();
    }

    if (eventId && eventId.trim().length > 0) {
      query.eventId = eventId.trim();
    }

    const params = new URLSearchParams(query).toString();
    return `funmap://payment/${source}?${params}`;
  }

  private async createPayChanguCheckoutSession(
    user: JwtUser,
    event: Event,
    txRef: string,
  ): Promise<{ checkoutUrl: string; status: string | null }> {
    const secretKey = this.configService.payChanguConfig.secretKey;
    const callbackUrl = this.configService.payChanguConfig.callbackUrl;
    const returnUrl = this.configService.payChanguConfig.returnUrl;

    if (!secretKey) {
      throw new InternalServerErrorException('PayChangu secret key is not configured');
    }

    if (!callbackUrl || !returnUrl) {
      throw new InternalServerErrorException(
        'PayChangu callback and return URLs are not configured',
      );
    }

    const profile = await this.usersRepository.findOne({ where: { id: user.sub } });
    const fullName = (profile?.displayName ?? '').trim();
    const [firstName, ...lastNameParts] = fullName.length > 0 ? fullName.split(/\s+/) : [];

    const fallbackEmail = `user-${user.sub.slice(0, 8)}@funmap.test`;
    const email = (profile?.email ?? fallbackEmail).trim();

    const amount = this.asNumber(event.ticketPrice);
    if (amount === null || amount <= 0) {
      throw new BadRequestException('Invalid event ticket amount');
    }

    const requestBody = {
      amount,
      currency: 'MWK',
      email,
      first_name: firstName || 'FunMap',
      last_name: lastNameParts.join(' ') || 'User',
      callback_url: callbackUrl,
      return_url: returnUrl,
      tx_ref: txRef,
      customization: {
        title: `FunMap - ${event.title}`,
        description: `Ticket payment for ${event.title}`,
      },
      meta: {
        userId: user.sub,
        eventId: event.id,
      },
    };

    const baseUrl = this.configService.payChanguConfig.baseUrl.replace(/\/$/, '');
    const paymentPath = this.configService.payChanguConfig.paymentPath;
    const requestUrl = `${baseUrl}${paymentPath.startsWith('/') ? '' : '/'}${paymentPath}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);

    try {
      const response = await fetch(requestUrl, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${secretKey}`,
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      const raw = await response.text();
      let parsed: PayChanguInitiateResponse | null = null;
      try {
        parsed = JSON.parse(raw) as PayChanguInitiateResponse;
      } catch {
        parsed = null;
      }

      if (!response.ok || !parsed) {
        this.logger.error(
          `PayChangu initiate transaction failed (${response.status}): ${raw}`,
        );
        throw new BadGatewayException('Unable to initiate PayChangu hosted payment');
      }

      const checkoutUrl = this.asString(parsed.data?.checkout_url);
      if (!checkoutUrl) {
        this.logger.error(`PayChangu response missing checkout_url: ${raw}`);
        throw new BadGatewayException('PayChangu did not return a checkout URL');
      }

      return {
        checkoutUrl,
        status: this.asString(parsed.data?.data?.status) ?? null,
      };
    } catch (error) {
      if (error instanceof BadGatewayException) {
        throw error;
      }

      this.logger.error(
        `Unable to create PayChangu checkout session for tx_ref ${txRef}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new BadGatewayException('Unable to create PayChangu checkout session');
    } finally {
      clearTimeout(timeout);
    }
  }

  private resolveSignature(
    signature: string | undefined,
    headers: IncomingHttpHeaders,
  ): string | undefined {
    if (signature && signature.trim().length > 0) {
      return signature.trim();
    }

    const configuredHeader = this.configService.payChanguConfig.webhookSignatureHeader;
    const configuredValue = headers[configuredHeader.toLowerCase()];
    if (typeof configuredValue === 'string') {
      return configuredValue.trim();
    }

    if (Array.isArray(configuredValue) && configuredValue.length > 0) {
      return configuredValue[0].trim();
    }

    return undefined;
  }

  private resolvePayloadRaw(rawBody: Buffer | undefined, payload: PayChanguWebhookDto): string {
    if (rawBody && rawBody.length > 0) {
      return rawBody.toString('utf8');
    }

    return JSON.stringify(payload ?? {});
  }

  private assertValidWebhookSignature(signature: string | undefined, rawPayload: string): void {
    const webhookSecret = this.configService.payChanguConfig.webhookSecret;
    if (!webhookSecret) {
      throw new InternalServerErrorException('PayChangu webhook secret is not configured');
    }

    if (!signature) {
      throw new UnauthorizedException('Missing webhook signature');
    }

    const computedSignature = createHmac('sha256', webhookSecret)
      .update(rawPayload)
      .digest('hex');

    const expected = Buffer.from(computedSignature, 'utf8');
    const actual = Buffer.from(signature.trim(), 'utf8');

    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      throw new UnauthorizedException('Invalid webhook signature');
    }
  }

  private extractWebhookPayload(payload: PayChanguWebhookDto) {
    const nested = this.toRecord(payload.data);

    const txRef =
      this.asString(payload.tx_ref) ??
      this.asString(nested.tx_ref) ??
      this.asString(payload.reference) ??
      this.asString(nested.reference) ??
      '';

    const reference =
      this.asString(payload.reference) ?? this.asString(nested.reference) ?? txRef;

    return {
      eventType:
        this.asString(payload.event) ??
        this.asString(payload.event_type) ??
        this.asString(payload.type) ??
        this.asString(nested.event) ??
        this.asString(nested.event_type) ??
        this.asString(nested.type) ??
        'api.charge.payment',
      status:
        this.asString(payload.status) ??
        this.asString(payload.payment_status) ??
        this.asString(nested.status) ??
        '',
      reference,
      txRef,
      amount: this.asNumber(payload.amount ?? nested.amount),
      currency:
        (this.asString(payload.currency) ?? this.asString(nested.currency) ?? '').toUpperCase(),
    };
  }

  private async verifyTransactionWithPayChangu(
    txRef: string,
  ): Promise<PayChanguVerifyResponseDto> {
    const secretKey = this.configService.payChanguConfig.secretKey;
    if (!secretKey) {
      throw new InternalServerErrorException('PayChangu secret key is not configured');
    }

    const verifyPathTemplate = this.configService.payChanguConfig.verifyPath;
    const verifyPath = verifyPathTemplate.includes('{tx_ref}')
      ? verifyPathTemplate.replace('{tx_ref}', encodeURIComponent(txRef))
      : `${verifyPathTemplate.replace(/\/$/, '')}/${encodeURIComponent(txRef)}`;

    const baseUrl = this.configService.payChanguConfig.baseUrl.replace(/\/$/, '');
    const requestUrl = `${baseUrl}${verifyPath.startsWith('/') ? '' : '/'}${verifyPath}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    try {
      const response = await fetch(requestUrl, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${secretKey}`,
        },
        signal: controller.signal,
      });

      const raw = await response.text();
      if (!response.ok) {
        this.logger.warn(
          `PayChangu verification request failed (${response.status}) for tx_ref ${txRef}`,
        );
        throw new BadGatewayException('PayChangu verification request failed');
      }

      try {
        return JSON.parse(raw) as PayChanguVerifyResponseDto;
      } catch {
        throw new BadGatewayException('Unable to parse PayChangu verification response');
      }
    } catch (error) {
      if (error instanceof BadGatewayException) {
        throw error;
      }

      this.logger.error(
        `Unable to verify PayChangu transaction ${txRef}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new BadGatewayException('Unable to verify PayChangu transaction');
    } finally {
      clearTimeout(timeout);
    }
  }

  private assertVerificationMatchesPayment(
    payment: Payment,
    webhookPayload: {
      reference: string;
      txRef: string;
      amount: number | null;
      currency: string;
      status: string;
      eventType: string;
    },
    verificationData: PayChanguVerifyDataDto,
  ): void {
    const verificationTxRef = this.asString(verificationData.tx_ref);
    if (verificationTxRef && verificationTxRef !== payment.reference) {
      throw new BadRequestException('Verification tx_ref mismatch');
    }

    const verificationReference = this.asString(verificationData.reference);
    if (
      verificationReference &&
      payment.providerReference &&
      verificationReference !== payment.providerReference
    ) {
      throw new BadRequestException('Verification reference mismatch');
    }

    const expectedCurrency = payment.currency.toUpperCase();
    const verifiedCurrency = (this.asString(verificationData.currency) ?? '').toUpperCase();
    if (verifiedCurrency && verifiedCurrency !== expectedCurrency) {
      throw new BadRequestException('Verification currency mismatch');
    }

    const expectedAmount = this.asNumber(payment.amount);
    const verifiedAmount = this.asNumber(verificationData.amount);
    if (expectedAmount !== null && verifiedAmount !== null && verifiedAmount < expectedAmount) {
      throw new BadRequestException('Verified amount is below expected amount');
    }

    if (
      webhookPayload.currency &&
      verifiedCurrency &&
      webhookPayload.currency !== verifiedCurrency
    ) {
      throw new BadRequestException('Webhook currency does not match verification response');
    }

    if (
      webhookPayload.amount !== null &&
      verifiedAmount !== null &&
      webhookPayload.amount > verifiedAmount
    ) {
      throw new BadRequestException('Webhook amount exceeds verification amount');
    }
  }

  private buildIdempotencyKey(
    reference: string,
    txRef: string,
    eventType: string,
    status: string | undefined,
  ): string {
    const normalized = `${reference}:${txRef}:${eventType}:${(status ?? 'unknown').toLowerCase()}`;

    return createHmac('sha256', this.configService.payChanguConfig.webhookSecret)
      .update(normalized)
      .digest('hex');
  }

  private isSuccessStatus(status: string | undefined): boolean {
    if (!status) {
      return false;
    }

    const normalized = status.toLowerCase();
    return normalized === 'success' || normalized === 'successful' || normalized === 'paid';
  }

  private isFailureStatus(status: string | undefined): boolean {
    if (!status) {
      return false;
    }

    const normalized = status.toLowerCase();
    return (
      normalized === 'failed' ||
      normalized === 'failure' ||
      normalized === 'cancelled' ||
      normalized === 'canceled' ||
      normalized === 'error'
    );
  }

  private asString(value: unknown): string | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  private asNumber(value: unknown): number | null {
    if (value === null || value === undefined) {
      return null;
    }

    const numeric = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }

  private toRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }

    return value as Record<string, unknown>;
  }
}
