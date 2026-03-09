import type { BreedContext, Breeder, ItemInput } from "./types.ts";

/** Default breeder that never produces new items. Preserves existing loop behavior. */
export class NoopBreeder implements Breeder {
  public async breed(_context: BreedContext): Promise<readonly ItemInput[]> {
    return [];
  }
}
