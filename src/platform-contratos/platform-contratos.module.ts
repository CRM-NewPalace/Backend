import { Module } from '@nestjs/common';
import { PlatformContratosController } from './platform-contratos.controller';
import { PlatformContratosService } from './platform-contratos.service';

@Module({
  controllers: [PlatformContratosController],
  providers: [PlatformContratosService],
  exports: [PlatformContratosService],
})
export class PlatformContratosModule {}
