import { Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module';
import { EmpreendimentosController } from './empreendimentos.controller';
import { EmpreendimentosService } from './empreendimentos.service';

@Module({
  imports: [MediaModule],
  controllers: [EmpreendimentosController],
  providers: [EmpreendimentosService],
  exports: [EmpreendimentosService],
})
export class EmpreendimentosModule {}
