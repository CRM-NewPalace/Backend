import { Module } from '@nestjs/common';
import { ConstrutorasController } from './construtoras.controller';
import { ConstrutorasService } from './construtoras.service';

@Module({
  controllers: [ConstrutorasController],
  providers: [ConstrutorasService],
  exports: [ConstrutorasService],
})
export class ConstrutorasModule {}
