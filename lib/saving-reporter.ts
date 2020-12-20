import {
  AggregatedResult,
  BaseReporter,
  Context,
  Test,
  TestResult,
} from '@jest/reporters';
import { create as createStore, Store } from './store';

export class ProgressSavingReporter extends BaseReporter {
  private _cache: { [cacheDir: string]: Store } = {};

  _getCache(test: Test): Store {
    const dir = test.context.config.cacheDirectory;
    if (!this._cache[dir]) {
      this._cache[dir] = createStore(dir);
    }

    return this._cache[dir];
  }

  async onRunComplete(
    _contexts?: Set<Context>,
    _aggregatedResults?: AggregatedResult,
  ): Promise<void> {
    await super.onRunComplete(_contexts, _aggregatedResults);
    for (const context of _contexts || []) {
      this._cache[context.config.cacheDirectory]?.markRunComplete();
    }
  }

  onTestStart(test?: Test) {
    if (test) {
      this._getCache(test).maybeMarkRunStart();
    }
  }

  onTestResult(
    test: Test,
    testResult: TestResult,
    results: AggregatedResult,
  ): void {
    super.onTestResult(test, testResult, results);
    test.context.config.rootDir;
    this._getCache(test).addOutcome(
      test.context.config.name,
      testResult.testFilePath,
      testResult.perfStats.end,
      testResult.perfStats.runtime,
      testResult.numFailingTests,
    );
  }
}
