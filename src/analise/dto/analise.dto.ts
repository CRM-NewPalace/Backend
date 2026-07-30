import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class QueryAnaliseDto {
  /** Admin/gerente/analista: filtra análises cujo lead pertence a este corretor. */
  @IsOptional()
  @IsUUID('4', { message: 'Corretor inválido.' })
  corretorId?: string;

  @IsOptional()
  @IsIn(['pendente', 'em_analise', 'aprovado', 'reprovado'], {
    message: 'Status inválido.',
  })
  status?: 'pendente' | 'em_analise' | 'aprovado' | 'reprovado';
}

const ANALISE_STATUSES = [
  'pendente',
  'em_analise',
  'aprovado',
  'reprovado',
] as const;

export class UpdateAnaliseDto {
  @IsOptional()
  @IsIn(ANALISE_STATUSES, { message: 'Status inválido.' })
  status?: (typeof ANALISE_STATUSES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  parecer?: string | null;
}
