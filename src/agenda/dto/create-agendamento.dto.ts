import {
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

export const AGENDAMENTO_TIPOS = [
  'visita',
  'ligacao',
  'reuniao',
  'outro',
] as const;

export const AGENDAMENTO_STATUS = [
  'agendado',
  'concluido',
  'cancelado',
] as const;

export class CreateAgendamentoDto {
  @IsUUID('4', { message: 'Lead/cliente inválido.' })
  leadId!: string;

  @IsString()
  @MinLength(2, { message: 'O título deve ter ao menos 2 caracteres.' })
  @MaxLength(160)
  titulo!: string;

  @IsIn(AGENDAMENTO_TIPOS, { message: 'Tipo de compromisso inválido.' })
  tipo!: (typeof AGENDAMENTO_TIPOS)[number];

  @IsISO8601({}, { message: 'Data/hora de início inválida.' })
  startsAt!: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined && v !== '')
  @IsISO8601({}, { message: 'Data/hora de término inválida.' })
  endsAt?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsString()
  @MaxLength(160)
  local?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsString()
  @MaxLength(2000)
  observacoes?: string | null;
}
