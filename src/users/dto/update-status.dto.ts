import { UserStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdateStatusDto {
  @IsEnum(UserStatus, { message: 'Status inválido.' })
  status!: UserStatus;
}
