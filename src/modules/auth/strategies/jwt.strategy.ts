import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Repository } from 'typeorm';
import { AppConfigService } from '../../../shared/config/app-config.service';
import { AccountStatus } from '../../../shared/enums/account-status.enum';
import { JwtUser } from '../../../shared/interfaces/jwt-user.interface';
import { User } from '../../users/entities/user.entity';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: AppConfigService,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.jwtAccessSecret,
    });
  }

  async validate(payload: JwtUser): Promise<JwtUser> {
    const user = await this.usersRepository.findOne({ where: { id: payload.sub } });

    if (!user) {
      throw new UnauthorizedException('User not found.');
    }

    if (user.accountStatus === AccountStatus.DELETED) {
      throw new UnauthorizedException('Account has been deleted permanently.');
    }

    if (user.accountStatus === AccountStatus.DEACTIVATED) {
      if (!user.deactivatedUntil || user.deactivatedUntil.getTime() > Date.now()) {
        throw new UnauthorizedException('Account is currently deactivated.');
      }

      user.accountStatus = AccountStatus.ACTIVE;
      user.deactivatedUntil = null;
      await this.usersRepository.save(user);
    }

    return payload;
  }
}

