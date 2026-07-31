import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { LeadsModule } from './leads/leads.module';
import { CatalogModule } from './catalog/catalog.module';
import { TriagemModule } from './triagem/triagem.module';
import { DocumentacaoModule } from './documentacao/documentacao.module';
import { EquipesModule } from './equipes/equipes.module';
import { AnaliseModule } from './analise/analise.module';
import { NotificacoesModule } from './notificacoes/notificacoes.module';
import { AgendaModule } from './agenda/agenda.module';
import { ConstrutorasModule } from './construtoras/construtoras.module';
import { EmpreendimentosModule } from './empreendimentos/empreendimentos.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { CsrfGuard } from './common/guards/csrf.guard';
import { validateEnv } from './config/env.validation';
import { THROTTLE } from './config/security.constants';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ...THROTTLE.global }],
    }),
    PrismaModule,
    AuthModule,
    UsersModule,
    LeadsModule,
    CatalogModule,
    TriagemModule,
    DocumentacaoModule,
    ConstrutorasModule,
    EmpreendimentosModule,
    DashboardModule,
    EquipesModule,
    AnaliseModule,
    NotificacoesModule,
    AgendaModule,
  ],
  controllers: [AppController],
  providers: [
    // A ordem importa: o rate limiting roda antes da autenticação, para que
    // uma enxurrada de requisições seja barrada sem tocar no banco.
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    // Autenticação JWT aplicada globalmente; use @Public() para abrir rotas.
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    // CSRF depois do JWT — mutações autenticadas exigem o header X-CSRF-Token.
    {
      provide: APP_GUARD,
      useClass: CsrfGuard,
    },
  ],
})
export class AppModule {}
