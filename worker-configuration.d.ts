import type { D1Database } from "./src/data/publication/d1-types";

declare global {
  interface CloudflareEnv {
    DB?: D1Database;
  }
}

export {};
