export interface Transport { send(body: string): Promise<string>; }
