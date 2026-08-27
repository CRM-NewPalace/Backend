import { Module } from '@nestjs/common';
import { ImoveisUsadosService } from './imoveis-usados.service';
import { ImoveisUsadosController } from './imoveis-usados.controller';
import { InteressadosUsadosController } from './interessados-usados.controller';

@Module({
  controllers: [InteressadosUsadosController, ImoveisUsadosController],
  providers: [ImoveisUsadosService],
  exports: [ImoveisUsadosService],
})
export class ImoveisUsadosModule {}
