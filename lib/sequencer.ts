import type { Test, AggregatedResult } from '@jest/reporters';
import { processStore, StoreLoader } from './store';
import { projectId, relativePath } from './context';

// allFailedTests and cacheResults aren't awaited until
// https://github.com/facebook/jest/pull/10980 (27.0.0-next.3)
export interface JestSequencer {
  sort(tests: Array<Test>): Promise<Array<Test>>;
  allFailedTests(tests: Array<Test>): Promise<Array<Test>>;
  cacheResults(tests: Array<Test>, results: AggregatedResult): void;
}

export class ClassicStyleSequencer implements JestSequencer {
  private readonly store: StoreLoader;
  constructor(storeLoader = processStore) {
    this.store = storeLoader;
  }

  async allFailedTests(tests: Array<Test>): Promise<Array<Test>> {
    const store = await this.store.load();
    const filtered: Test[] = [];
    for (const test of tests) {
      const testPath = relativePath(test.context, test.path);
      if (await store.mostRecentRunFailed(testPath)) {
        filtered.push(test);
      }
    }
    return filtered;
  }

  cacheResults(): void {}

  async sort(tests: Array<Test>): Promise<Array<Test>> {
    const store = await this.store.load();
    const tagged: [Test, number][] = [];
    for (const test of tests) {
      const score = await store.score(
        projectId(test.context),
        relativePath(test.context, test.path),
      );
      tagged.push([test, score ?? Infinity]);
    }
    tagged.sort(([, left], [, right]) => right - left);
    return tagged.map(([test]) => test);
  }
}
