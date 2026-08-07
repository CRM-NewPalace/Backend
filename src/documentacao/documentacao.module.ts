import { Module } from '@nestjs/common';
import { AnaliseModule } from '../analise/analise.module';
import { EquipesModule } from '../equipes/equipes.module';
import { FunisModule } from '../funis/funis.module';
import { DocumentacaoController } from './documentacao.controller';
import { DocumentacaoService } from './documentacao.service';

@Module({
  imports: [EquipesModule, FunisModule, AnaliseModule],
  controllers: [DocumentacaoController],
  providers: [DocumentacaoService],
})
export class DocumentacaoModule {}
