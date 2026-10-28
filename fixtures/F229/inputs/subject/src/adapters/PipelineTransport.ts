import type { Transport } from "../core/ports.ts";

export class PipelineTransport implements Transport {
  async send(body: string): Promise<string> {
    return body;
  }
}
