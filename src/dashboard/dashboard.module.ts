import { Module } from '@nestjs/common';
import { AgendaModule } from '../agenda/agenda.module';
import { EquipesModule } from '../equipes/equipes.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [AgendaModule, EquipesModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
