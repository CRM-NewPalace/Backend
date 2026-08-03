import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { PropostaStatus } from '@prisma/client';

export class QueryPropostaDto {
  @IsOptional()
  @IsUUID('4')
  corretorId?: string;

  @IsOptional()
  @IsEnum(PropostaStatus)
  status?: PropostaStatus;
}
