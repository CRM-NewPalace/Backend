import { Module } from '@nestjs/common';
import { DocumentacaoController } from './documentacao.controller';
import { DocumentacaoService } from './documentacao.service';

@Module({
  controllers: [DocumentacaoController],
  providers: [DocumentacaoService],
})
export class DocumentacaoModule {}
