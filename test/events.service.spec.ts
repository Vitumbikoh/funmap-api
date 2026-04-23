import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, beforeEach, jest } from '@jest/globals';
import { RsvpStatus } from '../src/shared/enums/rsvp-status.enum';
import { EventsService } from '../src/modules/events/events.service';

type RepoMock = {
  findOne: ReturnType<typeof jest.fn>;
  create: ReturnType<typeof jest.fn>;
  save: ReturnType<typeof jest.fn>;
  query: ReturnType<typeof jest.fn>;
};

describe('EventsService', () => {
  let eventsRepository: RepoMock;
  let rsvpRepository: RepoMock;
  let service: EventsService;

  beforeEach(() => {
    eventsRepository = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      query: jest.fn(),
    };

    rsvpRepository = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      query: jest.fn(),
    };

    service = new EventsService(eventsRepository as never, rsvpRepository as never);
  });

  it('blocks update when user is not organizer', async () => {
    eventsRepository.findOne.mockResolvedValue({
      id: 'event-1',
      organizerId: 'owner-1',
    });

    await expect(
      service.update(
        { sub: 'other-user', phoneNumber: '+265999', roles: [] },
        'event-1',
        { title: 'New title' },
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('soft-cancels event and closes active end date', async () => {
    const future = new Date(Date.now() + 1000 * 60 * 60);
    const event = {
      id: 'event-2',
      organizerId: 'owner-2',
      endDate: future,
      isPublished: true,
    };

    eventsRepository.findOne.mockResolvedValue(event);
    eventsRepository.save.mockResolvedValue(event);

    const result = await service.cancel(
      { sub: 'owner-2', phoneNumber: '+265888', roles: [] },
      'event-2',
    );

    expect(result).toEqual({
      id: 'event-2',
      cancelled: true,
      isPublished: false,
    });
    expect(event.isPublished).toBe(false);
    expect(event.endDate.getTime()).toBeLessThanOrEqual(Date.now());
    expect(eventsRepository.save).toHaveBeenCalledTimes(1);
  });

  it('does not increment RSVP count twice for already confirmed free RSVP', async () => {
    const event = {
      id: 'event-3',
      paymentRequired: false,
      organizerId: 'owner-3',
      rsvpCount: 4,
    };
    const existingRsvp = {
      eventId: 'event-3',
      userId: 'u-3',
      status: RsvpStatus.CONFIRMED,
    };

    eventsRepository.findOne.mockResolvedValue(event);
    rsvpRepository.findOne.mockResolvedValue(existingRsvp);
    rsvpRepository.save.mockResolvedValue(existingRsvp);

    await service.rsvp(
      { sub: 'u-3', phoneNumber: '+265777', roles: [] },
      'event-3',
    );

    expect(event.rsvpCount).toBe(4);
    expect(eventsRepository.save).not.toHaveBeenCalled();
    expect(rsvpRepository.save).toHaveBeenCalledTimes(1);
  });
});
