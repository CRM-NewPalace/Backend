import { Module } from '@nestjs/common';
import { LeadsController } from './leads.controller';
import { LeadsService } from './leads.service';
import { CatalogModule } from '../catalog/catalog.module';
import { EquipesModule } from '../equipes/equipes.module';
import { AnaliseModule } from '../analise/analise.module';

@Module({
  imports: [CatalogModule, EquipesModule, AnaliseModule],
  controllers: [LeadsController],
  providers: [LeadsService],
  exports: [LeadsService],
})
export class LeadsModule {}
