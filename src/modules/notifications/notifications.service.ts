import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtUser } from '../../shared/interfaces/jwt-user.interface';
import { Notification } from './entities/notification.entity';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private readonly notificationsRepository: Repository<Notification>,
  ) {}

  async listForUser(user: JwtUser) {
    return this.notificationsRepository.find({
      where: { recipientUserId: user.sub },
      order: { createdAt: 'DESC' },
      take: 50,
    });
  }
}

