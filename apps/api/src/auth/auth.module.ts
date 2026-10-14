import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { OidcService } from './oidc.service';
import { PgSessionStore } from './pg-session.store';

@Global()
@Module({
  controllers: [AuthController],
  providers: [OidcService, PgSessionStore, { provide: APP_GUARD, useClass: AuthGuard }],
  exports: [OidcService, PgSessionStore],
})
export class AuthModule {}
