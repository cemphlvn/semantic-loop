import type { SpanLike, Telemetry } from "./types.ts";

class NoopSpan implements SpanLike {
  public setAttribute(_name: string, _value: string | number | boolean): void {
    // no-op by design
  }

  public end(): void {
    // no-op by design
  }
}

export class NoopTelemetry implements Telemetry {
  public startSpan(_name: string): SpanLike {
    return new NoopSpan();
  }
}
