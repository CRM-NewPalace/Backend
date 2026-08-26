import { Module } from '@nestjs/common';
import { CaptacaoService } from './captacao.service';
import { CaptacoesController } from './captacoes.controller';
import { CaptacaoImoveisController } from './captacao-imoveis.controller';
import { ProprietariosController } from './proprietarios.controller';

@Module({
  controllers: [
    ProprietariosController,
    CaptacaoImoveisController,
    CaptacoesController,
  ],
  providers: [CaptacaoService],
  exports: [CaptacaoService],
})
export class CaptacaoModule {}
