import { Pool } from "pg";
import { config } from "../config.js";

const isLocalDatabase = /localhost|127\.0\.0\.1|@db[:/]/.test(config.databaseUrl);

export const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: isLocalDatabase ? undefined : { rejectUnauthorized: false },
});
