import { IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { UserStatus } from '@prisma/client';

/**
 * Criação de tenant.
 * O admin inicial (e-mail + senha) é gerado automaticamente no service.
 */
export class CreateTenantDto {
  @IsString()
  @MinLength(2, { message: 'O nome deve ter ao menos 2 caracteres.' })
  @MaxLength(120)
  name!: string;

  @IsString()
  @MinLength(2, { message: 'O slug deve ter ao menos 2 caracteres.' })
  @MaxLength(80)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message:
      'O slug deve conter apenas letras minúsculas, números e hífens (ex.: minha-imobiliaria).',
  })
  slug!: string;

  @IsOptional()
  @IsIn([UserStatus.ativo, UserStatus.inativo], {
    message: 'Status inválido.',
  })
  status?: UserStatus;
}
