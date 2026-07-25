import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { TriagemController } from './triagem.controller';
import { TriagemService } from './triagem.service';

@Module({
  imports: [CatalogModule],
  controllers: [TriagemController],
  providers: [TriagemService],
})
export class TriagemModule {}
