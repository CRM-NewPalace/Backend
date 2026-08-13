import { IsIn, IsOptional } from "class-validator";

export class QueryConstrutorasDto {
  @IsOptional()
  @IsIn(["created_desc", "created_asc", "nome_asc", "nome_desc"], {
    message:
      "Ordenação inválida. Use created_desc, created_asc, nome_asc ou nome_desc.",
  })
  sort?: "created_desc" | "created_asc" | "nome_asc" | "nome_desc";
}
