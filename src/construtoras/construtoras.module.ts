import { Module } from '@nestjs/common';
import { EquipesModule } from '../equipes/equipes.module';
import { ConstrutorasController } from './construtoras.controller';
import { ConstrutorasService } from './construtoras.service';

@Module({
  imports: [EquipesModule],
  controllers: [ConstrutorasController],
  providers: [ConstrutorasService],
  exports: [ConstrutorasService],
})
export class ConstrutorasModule {}
