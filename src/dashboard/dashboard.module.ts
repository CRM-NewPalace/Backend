import { Module } from '@nestjs/common';
import { AgendaModule } from '../agenda/agenda.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [AgendaModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
