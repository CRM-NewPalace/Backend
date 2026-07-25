import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { LEAD_INTERESSES, LEAD_PRIORIDADES, CONTATO_TIPOS } from '../lead.constants';

export class CreateLeadDto {
  /** lead (padrão) ou cliente da carteira pessoal. */
  @IsOptional()
  @IsIn(CONTATO_TIPOS, { message: 'Tipo inválido. Use lead ou cliente.' })
  tipo?: string;

  @IsString()
  @MinLength(2, { message: 'O nome deve ter ao menos 2 caracteres.' })
  @MaxLength(120)
  nome!: string;

  @IsString()
  @Matches(/^\(\d{2}\) \d{4,5}-\d{4}$/, {
    message: 'Telefone inválido. Use o formato (81) 99999-9999.',
  })
  @MaxLength(20)
  telefone!: string;

  @IsEmail({}, { message: 'Informe um e-mail válido.' })
  @MaxLength(255)
  email!: string;

  @IsString()
  @MaxLength(60)
  origem!: string;

  @IsIn(LEAD_INTERESSES, { message: 'Interesse inválido.' })
  interesse!: string;

  @IsString()
  @MaxLength(80)
  cidade!: string;

  @IsString()
  @MaxLength(80)
  bairro!: string;

  // A etapa é validada dinamicamente contra o catálogo ativo no LeadsService.
  @IsOptional()
  @IsString()
  @MaxLength(60)
  stage?: string;

  @IsOptional()
  @IsIn(LEAD_PRIORIDADES, { message: 'Prioridade inválida.' })
  prioridade?: string;

  /** Renda mensal do cliente (opcional). */
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @Transform(({ value }) => {
    if (value === undefined) return undefined;
    if (value === null || value === '') return null;
    return Number(value);
  })
  @IsInt({ message: 'Renda inválida.' })
  @Min(0, { message: 'Renda não pode ser negativa.' })
  renda?: number | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  tags?: string[];

  /**
   * Corretor dono do lead. Ignorado para o perfil corretor (força o próprio id).
   * Admin/gerente podem atribuir livremente.
   */
  @IsOptional()
  @IsUUID('4', { message: 'Corretor inválido.' })
  corretorId?: string;
}
