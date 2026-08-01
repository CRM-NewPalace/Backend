import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateMetaConnectionDto {
  @IsString()
  @MinLength(1, { message: 'O pageId é obrigatório.' })
  @MaxLength(120)
  pageId!: string;

  @IsString()
  @MinLength(1, { message: 'O pageAccessToken é obrigatório.' })
  @MaxLength(2000)
  pageAccessToken!: string;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}
