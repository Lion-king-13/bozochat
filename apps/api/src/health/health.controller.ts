import { Controller, Get } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { Database } from '../db/client';
import { InjectDb } from '../db/db.module';

/** Utilisé par Docker/Coolify (healthcheck) pour valider un déploiement avant de basculer le trafic. */
@Controller('health')
export class HealthController {
  constructor(@InjectDb() private readonly db: Database) {}

  @Get()
  async check() {
    await this.db.execute(sql`SELECT 1`);
    return { status: 'ok' };
  }
}
