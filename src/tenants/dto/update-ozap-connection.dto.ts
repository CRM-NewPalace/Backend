import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateOzapConnectionDto {
  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}
