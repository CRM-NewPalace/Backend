import { IsIn, IsInt, IsOptional, IsUUID, Min } from 'class-validator';

export const META_TIPOS = ['vendas', 'documentacoes', 'vgv'] as const;
export const META_PERIODOS = ['diaria', 'semanal', 'mensal'] as const;

export class CreateMetaDto {
  /**
   * Obrigatório para o gerente. É ignorado para o corretor, que sempre cria
   * uma meta pessoal para si mesmo.
   */
  @IsOptional()
  @IsUUID('4', { message: 'Corretor inválido.' })
  corretorId?: string;

  @IsIn(META_TIPOS, { message: 'Indicador de meta inválido.' })
  tipo!: (typeof META_TIPOS)[number];

  @IsIn(META_PERIODOS, { message: 'Período de meta inválido.' })
  periodo!: (typeof META_PERIODOS)[number];

  @IsInt({ message: 'O valor da meta deve ser um número inteiro.' })
  @Min(1, { message: 'O valor da meta deve ser maior que zero.' })
  valor!: number;
}
