import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { ModerationService } from '../src/modules/moderation/moderation.service';
import { ReportStatus } from '../src/modules/moderation/enums/report-status.enum';
import { ReportTargetType } from '../src/modules/moderation/enums/report-target-type.enum';

type RepoMock = {
  findOne: ReturnType<typeof jest.fn>;
  findAndCount: ReturnType<typeof jest.fn>;
  create: ReturnType<typeof jest.fn>;
  save: ReturnType<typeof jest.fn>;
  exist: ReturnType<typeof jest.fn>;
};

describe('ModerationService', () => {
  let reportsRepository: RepoMock;
  let postsRepository: RepoMock;
  let reelsRepository: RepoMock;
  let eventsRepository: RepoMock;
  let usersRepository: RepoMock;
  let service: ModerationService;

  beforeEach(() => {
    reportsRepository = {
      findOne: jest.fn(),
      findAndCount: jest.fn(),
      create: jest.fn((p) => p),
      save: jest.fn((p) => p),
      exist: jest.fn(),
    };

    postsRepository = {
      findOne: jest.fn(),
      findAndCount: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      exist: jest.fn(),
    };

    reelsRepository = {
      findOne: jest.fn(),
      findAndCount: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      exist: jest.fn(),
    };

    eventsRepository = {
      findOne: jest.fn(),
      findAndCount: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      exist: jest.fn(),
    };

    usersRepository = {
      findOne: jest.fn(),
      findAndCount: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      exist: jest.fn(),
    };

    service = new ModerationService(
      reportsRepository as never,
      postsRepository as never,
      reelsRepository as never,
      eventsRepository as never,
      usersRepository as never,
    );
  });

  it('rejects self-reporting own user account', async () => {
    await expect(
      service.createReport(
        { sub: 'user-1', phoneNumber: '+265111', roles: [] },
        {
          targetType: ReportTargetType.USER,
          targetId: 'user-1',
          reason: 'abuse',
        },
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('returns duplicate when open report already exists', async () => {
    postsRepository.exist.mockResolvedValue(true);
    reportsRepository.findOne.mockResolvedValue({
      id: 'rep-1',
      status: ReportStatus.OPEN,
    });

    const result = await service.createReport(
      { sub: 'user-2', phoneNumber: '+265222', roles: [] },
      {
        targetType: ReportTargetType.POST,
        targetId: 'post-1',
        reason: 'Spam',
      },
    );

    expect(result).toEqual({
      id: 'rep-1',
      status: ReportStatus.OPEN,
      duplicate: true,
    });
    expect(reportsRepository.save).not.toHaveBeenCalled();
  });

  it('resolves open report with admin metadata', async () => {
    const report = {
      id: 'rep-2',
      status: ReportStatus.OPEN,
      resolvedAt: null,
      resolvedByUserId: null,
      resolutionNote: null,
    };

    reportsRepository.findOne.mockResolvedValue(report);
    reportsRepository.save.mockImplementation(async (input) => input);

    const result = await service.resolveReport(
      { sub: 'admin-1', phoneNumber: '+265333', roles: [] },
      'rep-2',
      {
        status: ReportStatus.RESOLVED,
        resolutionNote: 'Content removed',
      },
    );

    expect(result.status).toBe(ReportStatus.RESOLVED);
    expect(result.resolvedByUserId).toBe('admin-1');
    expect(result.resolutionNote).toBe('Content removed');
  });

  it('rejects OPEN as resolve status', async () => {
    await expect(
      service.resolveReport(
        { sub: 'admin-2', phoneNumber: '+265444', roles: [] },
        'rep-3',
        {
          status: ReportStatus.OPEN,
        },
      ),
    ).rejects.toThrow(BadRequestException);
  });
});
