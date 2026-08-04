import {
  IsDateString,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class BaixarTituloDto {
  @IsDateString({}, { message: 'Data de pagamento inválida.' })
  dataPagamento!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  formaPagamento?: string;
}
