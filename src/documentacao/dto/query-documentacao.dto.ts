import { IsIn, IsOptional, IsUUID } from 'class-validator';

export class QueryDocumentacaoDto {
  /** Admin/gerente: filtra fichas cujo lead pertence a este corretor. */
  @IsOptional()
  @IsUUID('4', { message: 'Corretor inválido.' })
  corretorId?: string;

  @IsOptional()
  @IsIn(['created_desc', 'created_asc', 'nome_asc', 'nome_desc'], {
    message:
      'Ordenação inválida. Use created_desc, created_asc, nome_asc ou nome_desc.',
  })
  sort?: 'created_desc' | 'created_asc' | 'nome_asc' | 'nome_desc';
}
