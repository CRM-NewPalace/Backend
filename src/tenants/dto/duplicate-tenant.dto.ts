import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

/**
 * Duplicação de tenant. Nome/slug opcionais — o padrão é “Nome (cópia)” / slug-copia.
 * O clone é um tenant novo, sem FK nem conexão compartilhada com o original.
 */
export class DuplicateTenantDto {
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'O nome deve ter ao menos 2 caracteres.' })
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'O slug deve ter ao menos 2 caracteres.' })
  @MaxLength(80)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message:
      'O slug deve conter apenas letras minúsculas, números e hífens (ex.: minha-imobiliaria-copia).',
  })
  slug?: string;
}
