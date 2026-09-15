import { Global, Inject, Module, OnApplicationShutdown } from '@nestjs/common';
import { Pool } from 'pg';
import { createDb } from './client';

export const DB = Symbol('DB');
export const InjectDb = () => Inject(DB);

const PG_POOL = Symbol('PG_POOL');

@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      useFactory: () => createDb(process.env.DATABASE_URL ?? ''),
    },
    {
      provide: DB,
      inject: [PG_POOL],
      useFactory: (conn: ReturnType<typeof createDb>) => conn.db,
    },
  ],
  exports: [DB],
})
export class DbModule implements OnApplicationShutdown {
  constructor(@Inject(PG_POOL) private readonly conn: { pool: Pool }) {}

  async onApplicationShutdown() {
    await this.conn.pool.end();
  }
}
