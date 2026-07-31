import { IsInt, IsISO8601, IsObject, IsString } from 'class-validator';

export class OzapWebhookDto {
  @IsString()
  event!: string;

  @IsInt()
  instance_id!: number;

  @IsISO8601()
  timestamp!: string;

  @IsObject()
  data!: Record<string, unknown>;
}
