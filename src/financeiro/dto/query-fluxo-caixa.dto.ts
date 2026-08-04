import { IsDateString, IsIn, IsOptional } from 'class-validator';

export const FLUXO_GRANULARIDADES = [
  'dia',
  'semana',
  'mes',
  'trimestre',
] as const;

export type FluxoGranularidade = (typeof FLUXO_GRANULARIDADES)[number];

export class QueryFluxoCaixaDto {
  @IsOptional()
  @IsDateString({}, { message: 'Data inicial inválida.' })
  from?: string;

  @IsOptional()
  @IsDateString({}, { message: 'Data final inválida.' })
  to?: string;

  @IsOptional()
  @IsIn(FLUXO_GRANULARIDADES, {
    message: 'Granularidade deve ser dia, semana, mes ou trimestre.',
  })
  granularidade?: FluxoGranularidade;
}
