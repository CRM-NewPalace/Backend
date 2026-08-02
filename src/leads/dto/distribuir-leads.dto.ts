import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export class DistribuirEquipeItemDto {
  @IsUUID('4')
  equipeId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  quantidade!: number;
}

/** Admin: divide leads sem dono/equipe entre equipes. */
export class DistribuirEquipesDto {
  @IsIn(['equipes'])
  modo!: 'equipes';

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => DistribuirEquipeItemDto)
  alocacoes!: DistribuirEquipeItemDto[];
}

/** Gerente: round-robin entre corretores da equipe. */
export class DistribuirCorretoresDto {
  @IsIn(['corretores'])
  modo!: 'corretores';

  /** Quantidade que cada corretor recebe por rodada da fila. */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  porCorretor!: number;
}
