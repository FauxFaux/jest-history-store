import type { Test, AggregatedResult } from '@jest/reporters';
import { StoreStore } from './store';

export interface JestSequencer {
  sort(tests: Array<Test>): Array<Test>;
  allFailedTests(tests: Array<Test>): Array<Test>;
  cacheResults(tests: Array<Test>, results: AggregatedResult): void;
}

export class ClassicStyleSequencer implements JestSequencer {
  private stores = new StoreStore();
  allFailedTests(tests: Array<Test>): Array<Test> {
    return tests.filter((test) =>
      this.stores.cache(test).mostRecentRunFailed(test.path),
    );
  }

  cacheResults(tests: Array<Test>, results: AggregatedResult): void {}

  sort(tests: Array<Test>): Array<Test> {
    return tests
      .map((test) => {
        const score = this.stores
          .cache(test)
          .score(test.context.config.name, test.path);
        return [test, score] as const;
      })
      .sort(([, left], [, right]) => right - left)
      .map(([test]) => test);
  }
}