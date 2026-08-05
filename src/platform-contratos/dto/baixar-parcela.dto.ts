import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

export class BaixarParcelaDto {
  @IsDateString({}, { message: 'Data de pagamento inválida.' })
  dataPagamento!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  formaPagamento?: string;
}
