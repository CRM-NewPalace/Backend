import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateConstrutoraDto {
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'O nome deve ter ao menos 2 caracteres.' })
  @MaxLength(120)
  nome?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  contato?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  endereco?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  viabilizadorNome?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  viabilizadorContato?: string | null;
}
