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
  'tarefa',
  'outro',
] as const;

export const AGENDAMENTO_STATUS = [
  'agendado',
  'concluido',
  'cancelado',
] as const;

export const AGENDAMENTO_ESCOPOS = ['pessoal', 'com_gerente'] as const;

export const AGENDAMENTO_ALVOS = ['nenhum', 'todos', 'equipe', 'gerente'] as const;

export class CreateAgendamentoDto {
  /** Opcional em tarefa pessoal; obrigatório quando envolve o gerente. */
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined && v !== '')
  @IsUUID('4', { message: 'Lead/cliente inválido.' })
  leadId?: string | null;

  @IsString()
  @MinLength(2, { message: 'O título deve ter ao menos 2 caracteres.' })
  @MaxLength(160)
  titulo!: string;

  @IsIn(AGENDAMENTO_TIPOS, { message: 'Tipo de compromisso inválido.' })
  tipo!: (typeof AGENDAMENTO_TIPOS)[number];

  /** pessoal = tarefa do corretor; com_gerente = precisa aprovação. */
  @IsIn(AGENDAMENTO_ESCOPOS, { message: 'Escopo inválido.' })
  escopo!: (typeof AGENDAMENTO_ESCOPOS)[number];

  /** Público de eventos do admin (todos / equipe / gerente). */
  @IsOptional()
  @IsIn(AGENDAMENTO_ALVOS, { message: 'Público do evento inválido.' })
  alvoTipo?: (typeof AGENDAMENTO_ALVOS)[number];

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined && v !== '')
  @IsUUID('4', { message: 'Equipe inválida.' })
  alvoEquipeId?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined && v !== '')
  @IsUUID('4', { message: 'Gerente inválido.' })
  alvoGerenteId?: string | null;

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
