import { IsInt, Min } from 'class-validator';

export class UpdateMetaDto {
  @IsInt({ message: 'O valor da meta deve ser um número inteiro.' })
  @Min(1, { message: 'O valor da meta deve ser maior que zero.' })
  valor!: number;
}
