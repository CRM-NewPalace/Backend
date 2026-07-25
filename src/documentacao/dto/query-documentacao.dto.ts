import { IsOptional, IsUUID } from 'class-validator';

export class QueryDocumentacaoDto {
  /** Admin/gerente: filtra fichas cujo lead pertence a este corretor. */
  @IsOptional()
  @IsUUID('4', { message: 'Corretor inválido.' })
  corretorId?: string;
}
