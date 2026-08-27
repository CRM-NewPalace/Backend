import { Module } from '@nestjs/common';
import { ImoveisUsadosService } from './imoveis-usados.service';
import { VendaUsadoFluxoService } from './venda-usado-fluxo.service';
import { ImoveisUsadosController } from './imoveis-usados.controller';
import { InteressadosUsadosController } from './interessados-usados.controller';

@Module({
  controllers: [InteressadosUsadosController, ImoveisUsadosController],
  providers: [ImoveisUsadosService, VendaUsadoFluxoService],
  exports: [ImoveisUsadosService, VendaUsadoFluxoService],
})
export class ImoveisUsadosModule {}
