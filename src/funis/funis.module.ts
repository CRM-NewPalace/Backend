import { Module } from '@nestjs/common';
import { FunisController } from './funis.controller';
import { FunisService } from './funis.service';
import { LeadMonitoramentoModule } from '../leads/lead-monitoramento.module';

@Module({
  imports: [LeadMonitoramentoModule],
  controllers: [FunisController],
  providers: [FunisService],
  exports: [FunisService],
})
export class FunisModule {}
