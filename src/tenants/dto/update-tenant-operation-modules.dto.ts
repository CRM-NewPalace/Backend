import { IsBoolean, IsOptional } from 'class-validator';

/** Só operações imobiliárias — o admin do tenant não altera o plano CRM. */
export class UpdateTenantOperationModulesDto {
  @IsOptional()
  @IsBoolean()
  captacao?: boolean;

  @IsOptional()
  @IsBoolean()
  imoveisUsados?: boolean;

  @IsOptional()
  @IsBoolean()
  locacao?: boolean;
}
