/**
 * A single FIFO lock shared by every background manager. All read-modify-write
 * cycles on chrome.storage run through it, so a focus completion and a
 * distraction interception can never interleave and lose an update.
 */
export class Serial {
  private chain: Promise<unknown> = Promise.resolve();

  run<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.chain.then(fn, fn);
    this.chain = result.catch(() => undefined);
    return result;
  }
}
