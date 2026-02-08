// ──────────────────────────────────────────
// Knex configuration
// ──────────────────────────────────────────

import dotenv from 'dotenv';
import path from 'path';
import { Knex } from 'knex';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const config: Knex.Config = {
  client: 'pg',
  connection: process.env.DATABASE_URL,
  migrations: {
    directory: path.resolve(__dirname, 'migrations'),
    extension: 'ts',
  },
  seeds: {
    directory: path.resolve(__dirname, 'seeds'),
    extension: 'ts',
  },
};

export default config;
