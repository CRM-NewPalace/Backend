import { IsOptional, IsUUID } from 'class-validator';

export class QueryTriagemLeadsDto {
  /** Obrigatório para admin/gerente: filtra leads desse corretor. */
  @IsOptional()
  @IsUUID('4', { message: 'Corretor inválido.' })
  corretorId?: string;
}
