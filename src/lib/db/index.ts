import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";
import * as schema from "./schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}

// Driver WebSocket per Neon Serverless — necessario perché:
// (1) supporta db.transaction() che neon-http NON supporta
// (2) consente connection pooling reale
// Su Node, neonConfig.webSocketConstructor = ws (lib npm "ws").
neonConfig.webSocketConstructor = ws;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });

export type DB = typeof db;
