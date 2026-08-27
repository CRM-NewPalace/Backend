import { Module } from '@nestjs/common';
import { ImoveisUsadosService } from './imoveis-usados.service';
import { VendaUsadoFluxoService } from './venda-usado-fluxo.service';
import { VendaUsadoFechamentoService } from './venda-usado-fechamento.service';
import { ImoveisUsadosController } from './imoveis-usados.controller';
import { InteressadosUsadosController } from './interessados-usados.controller';

@Module({
  controllers: [InteressadosUsadosController, ImoveisUsadosController],
  providers: [
    ImoveisUsadosService,
    VendaUsadoFluxoService,
    VendaUsadoFechamentoService,
  ],
  exports: [
    ImoveisUsadosService,
    VendaUsadoFluxoService,
    VendaUsadoFechamentoService,
  ],
})
export class ImoveisUsadosModule {}
