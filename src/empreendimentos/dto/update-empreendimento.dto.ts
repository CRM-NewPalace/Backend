import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { EmpreendimentoStatus, EmpreendimentoTipo } from '@prisma/client';
import { HEX_COR_REGEX } from '../../common/utils/cor';
import { toDateOnly } from './create-empreendimento.dto';

function emptyToNull({ value }: { value: unknown }) {
  if (value === '') return null;
  return value;
}

export class UpdateEmpreendimentoDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  nome?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== '')
  @IsString()
  @Matches(HEX_COR_REGEX, { message: 'Informe a cor no formato #RRGGBB.' })
  cor?: string | null;

  @IsOptional()
  @IsUUID('4')
  construtoraId?: string | null;

  @IsOptional()
  @Transform(emptyToNull)
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsUUID('4')
  localidadeId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  cidade?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  endereco?: string | null;

  @IsOptional()
  @Transform(emptyToNull)
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsEnum(EmpreendimentoTipo, { message: 'Tipo de empreendimento inválido.' })
  tipo?: EmpreendimentoTipo | null;

  @IsOptional()
  @Transform(emptyToNull)
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsEnum(EmpreendimentoStatus, { message: 'Status do empreendimento inválido.' })
  status?: EmpreendimentoStatus | null;

  @IsOptional()
  @Transform(toDateOnly)
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsDateString({}, { message: 'Previsão de entrega inválida.' })
  previsaoEntrega?: string | null;

  @IsOptional()
  @IsBoolean()
  litoral?: boolean;

  @IsOptional()
  @IsBoolean()
  aceitaFgts?: boolean;

  @IsOptional()
  @IsBoolean()
  aceitaMcmv?: boolean;

  @IsOptional()
  @IsBoolean()
  aceitaCaixa?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observacao?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  quartos?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  banheiros?: number | null;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined) return undefined;
    if (value === null || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : value;
  })
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsNumber()
  @Min(0)
  areaM2?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  externalUrl?: string | null;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}
