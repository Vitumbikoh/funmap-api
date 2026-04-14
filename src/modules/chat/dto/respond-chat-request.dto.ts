import { IsIn } from 'class-validator';

export class RespondChatRequestDto {
  @IsIn(['accept', 'decline'])
  action: 'accept' | 'decline';
}
