import { Module } from '@nestjs/common';
import { EquipesModule } from '../equipes/equipes.module';
import { AnaliseController } from './analise.controller';
import { AnaliseService } from './analise.service';

@Module({
  imports: [EquipesModule],
  controllers: [AnaliseController],
  providers: [AnaliseService],
  exports: [AnaliseService],
})
export class AnaliseModule {}
