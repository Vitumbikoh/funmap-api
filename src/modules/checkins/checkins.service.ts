import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Point } from 'geojson';
import { Repository } from 'typeorm';
import { GeoQueryDto } from '../../shared/dto/geo-query.dto';
import { JwtUser } from '../../shared/interfaces/jwt-user.interface';
import { CreateCheckinDto } from './dto/create-checkin.dto';
import { Checkin } from './entities/checkin.entity';

@Injectable()
export class CheckinsService {
  constructor(
    @InjectRepository(Checkin)
    private readonly checkinsRepository: Repository<Checkin>,
  ) {}

  async create(user: JwtUser, payload: CreateCheckinDto) {
    const checkin = this.checkinsRepository.create({
      userId: user.sub,
      eventId: payload.eventId,
      venueName: payload.venueName,
      location: {
        type: 'Point',
        coordinates: [payload.longitude, payload.latitude],
      } as Point,
      township: payload.township,
      district: payload.district,
      region: payload.region,
      country: payload.country,
      note: payload.note,
    });

    return this.checkinsRepository.save(checkin);
  }

  async findNearby(query: GeoQueryDto) {
    return this.checkinsRepository.query(
      `
        SELECT
          c.*,
          ST_Distance(
            c.location,
            ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
          ) / 1000 AS distance_km
        FROM checkins c
        WHERE ST_DWithin(
          c.location,
          ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
          $3 * 1000
        )
        ORDER BY c.created_at DESC
        LIMIT 50
      `,
      [query.longitude, query.latitude, query.radiusKm ?? 10],
    );
  }
}

