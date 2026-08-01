import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateMetaConnectionDto {
  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'O pageAccessToken não pode ser vazio.' })
  @MaxLength(2000)
  pageAccessToken?: string;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}
