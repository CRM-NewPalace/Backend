import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RecusarAgendamentoDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  motivo?: string;
}
