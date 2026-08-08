import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { PresenceModule } from '../presence/presence.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { BootstrapAdminService } from './bootstrap-admin.service';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [PassportModule, JwtModule.register({}), PresenceModule],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, BootstrapAdminService],
  exports: [AuthService],
})
export class AuthModule {}
