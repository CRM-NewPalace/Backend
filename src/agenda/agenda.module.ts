import { Module } from '@nestjs/common';
import { EquipesModule } from '../equipes/equipes.module';
import { NotificacoesModule } from '../notificacoes/notificacoes.module';
import { AgendaController } from './agenda.controller';
import { AgendaService } from './agenda.service';

@Module({
  imports: [EquipesModule, NotificacoesModule],
  controllers: [AgendaController],
  providers: [AgendaService],
  exports: [AgendaService],
})
export class AgendaModule {}
