import { Module } from '@nestjs/common';
import { EmpreendimentosController } from './empreendimentos.controller';
import { EmpreendimentosService } from './empreendimentos.service';

@Module({
  controllers: [EmpreendimentosController],
  providers: [EmpreendimentosService],
  exports: [EmpreendimentosService],
})
export class EmpreendimentosModule {}
