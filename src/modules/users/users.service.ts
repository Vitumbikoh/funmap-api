import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Point } from 'geojson';
import { Repository } from 'typeorm';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { User } from './entities/user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  async findById(id: string): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { id } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async updateProfile(userId: string, payload: UpdateProfileDto): Promise<User> {
    const user = await this.findById(userId);

    const homeLocation =
      payload.latitude !== undefined && payload.longitude !== undefined
        ? ({
            type: 'Point',
            coordinates: [payload.longitude, payload.latitude],
          } as Point)
        : user.homeLocation;

    Object.assign(user, {
      username: payload.username ?? user.username,
      displayName: payload.displayName ?? user.displayName,
      avatarUrl: payload.avatarUrl ?? user.avatarUrl,
      bio: payload.bio ?? user.bio,
      township: payload.township ?? user.township,
      district: payload.district ?? user.district,
      region: payload.region ?? user.region,
      country: payload.country ?? user.country,
      interests: payload.interests ?? user.interests,
      homeLocation,
      lastActiveAt: new Date(),
    });

    return this.usersRepository.save(user);
  }
}

