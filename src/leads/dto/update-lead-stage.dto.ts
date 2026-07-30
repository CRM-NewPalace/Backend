import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

/**
 * Movimenta o lead entre as etapas do funil.
 * A etapa é validada dinamicamente contra o catálogo ativo no LeadsService.
 * Ao ir para em-analise, construtoraId e empreendimentoId são obrigatórios
 * (salvo se o lead já tiver ambos preenchidos).
 */
export class UpdateLeadStageDto {
  @IsString()
  @MaxLength(60)
  stage!: string;

  @IsOptional()
  @IsUUID('4', { message: 'Construtora inválida.' })
  construtoraId?: string;

  @IsOptional()
  @IsUUID('4', { message: 'Empreendimento inválido.' })
  empreendimentoId?: string;
}
