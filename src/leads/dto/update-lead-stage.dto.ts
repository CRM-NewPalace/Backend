import { IsIn } from 'class-validator';
import { LEAD_STAGES } from '../lead.constants';

/** Movimenta o lead entre as etapas do funil. */
export class UpdateLeadStageDto {
  @IsIn(LEAD_STAGES, { message: 'Etapa do funil inválida.' })
  stage!: string;
}
