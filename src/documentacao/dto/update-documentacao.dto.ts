import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import {
  DocumentacaoFonte,
  DocumentacaoStatus1,
  DocumentacaoStatus2,
} from '@prisma/client';

function toOptionalInt({ value }: { value: unknown }) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  return Number(value);
}

export class UpdateDocumentacaoDto {
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'O nome deve ter ao menos 2 caracteres.' })
  @MaxLength(120)
  nome?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined && v !== '')
  @IsUUID('4', { message: 'Construtora inválida.' })
  construtoraId?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined && v !== '')
  @IsUUID('4', { message: 'Empreendimento inválido.' })
  empreendimentoId?: string | null;

  @IsOptional()
  @IsEnum(DocumentacaoFonte, { message: 'Fonte inválida.' })
  fonte?: DocumentacaoFonte;

  @IsOptional()
  @IsEnum(DocumentacaoStatus1, { message: 'Status 1 inválido.' })
  status1?: DocumentacaoStatus1;

  @IsOptional()
  @IsEnum(DocumentacaoStatus2, { message: 'Status 2 inválido.' })
  status2?: DocumentacaoStatus2;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined && v !== '')
  @IsUUID('4', { message: 'Corretor inválido.' })
  corretorId?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined && v !== '')
  @IsUUID('4', { message: 'Gerente inválido.' })
  gerenteId?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined && v !== '')
  @IsDateString({}, { message: 'Data de análise inválida.' })
  dataAnalise?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined && v !== '')
  @IsDateString({}, { message: 'Data de venda inválida.' })
  dataVenda?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @Transform(toOptionalInt)
  @IsInt({ message: 'VGV inválido.' })
  @Min(0, { message: 'VGV não pode ser negativo.' })
  vgv?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  obs?: string | null;
}
