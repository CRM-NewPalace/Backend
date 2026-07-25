import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { EquipesModule } from '../equipes/equipes.module';
import { TriagemController } from './triagem.controller';
import { TriagemService } from './triagem.service';

@Module({
  imports: [CatalogModule, EquipesModule],
  controllers: [TriagemController],
  providers: [TriagemService],
})
export class TriagemModule {}
