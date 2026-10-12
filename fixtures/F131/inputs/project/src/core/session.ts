import { query } from "../db/client.ts";

export interface Session {
  id: string;
}

export const load = (id: string) => query(`select * from sessions where id = '${id}'`);
