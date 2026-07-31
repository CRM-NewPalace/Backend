import { Module } from '@nestjs/common';
import { EquipesModule } from '../equipes/equipes.module';
import { MetasController } from './metas.controller';
import { MetasService } from './metas.service';

@Module({
  imports: [EquipesModule],
  controllers: [MetasController],
  providers: [MetasService],
})
export class MetasModule {}
