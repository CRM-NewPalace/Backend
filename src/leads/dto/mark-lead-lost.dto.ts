import { IsString, MaxLength, MinLength } from 'class-validator';

/** Motivo informado ao marcar o lead como perdido (sai das listas operacionais). */
export class MarkLeadLostDto {
  @IsString()
  @MinLength(2, { message: 'Informe o motivo da exclusão.' })
  @MaxLength(200)
  motivo!: string;
}
