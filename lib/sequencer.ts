import type { Test, AggregatedResult } from '@jest/reporters';
import { StoreStore } from './store';
import { projectId, relativePath } from './context';

export interface JestSequencer {
  sort(tests: Array<Test>): Array<Test>;
  allFailedTests(tests: Array<Test>): Array<Test>;
  cacheResults(tests: Array<Test>, results: AggregatedResult): void;
}

export class ClassicStyleSequencer implements JestSequencer {
  private stores = new StoreStore();
  allFailedTests(tests: Array<Test>): Array<Test> {
    return tests.filter((test) =>
      this.stores
        .cache(test)
        .mostRecentRunFailed(relativePath(test.context, test.path)),
    );
  }

  cacheResults(tests: Array<Test>, results: AggregatedResult): void {}

  sort(tests: Array<Test>): Array<Test> {
    return tests
      .map((test) => {
        const score = this.stores
          .cache(test)
          .score(
            projectId(test.context),
            relativePath(test.context, test.path),
          );
        return [test, score] as const;
      })
      .sort(([, left], [, right]) => (right ?? Infinity) - (left ?? Infinity))
      .map(([test]) => test);
  }
}
