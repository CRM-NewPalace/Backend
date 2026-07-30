import {
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateConstrutoraDto {
  @IsString()
  @MinLength(2, { message: 'O nome deve ter ao menos 2 caracteres.' })
  @MaxLength(120)
  nome!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  contato?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  endereco?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  viabilizadorNome?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  viabilizadorContato?: string;
}
