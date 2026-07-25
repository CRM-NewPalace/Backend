import { IsString, MaxLength } from 'class-validator';

/**
 * Movimenta o lead entre as etapas do funil.
 * A etapa é validada dinamicamente contra o catálogo ativo no LeadsService.
 */
export class UpdateLeadStageDto {
  @IsString()
  @MaxLength(60)
  stage!: string;
}
