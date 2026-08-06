import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

/**
 * Movimenta o lead entre as etapas do funil.
 * A etapa é validada dinamicamente contra o funil ativo no LeadsService.
 * Ao ir para etapa com papel "análise", construtoraId e empreendimentoId
 * são obrigatórios (salvo se o lead já tiver ambos preenchidos).
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

  /**
   * Quando true, não cria o evento automático na Triagem.
   * Usado pelo funil quando o modal de relato registra o único acontecimento.
   */
  @IsOptional()
  @IsBoolean()
  omitTriagem?: boolean;
}
