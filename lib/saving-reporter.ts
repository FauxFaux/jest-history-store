import {
  AggregatedResult,
  BaseReporter,
  Context,
  Test,
  TestResult,
} from '@jest/reporters';
import { create as createStore, Store } from './store';
import { projectId, relativePath } from './context';
import { shrinkCoverage } from './shrink-coverage';
import * as zlib from 'zlib';
import { promisify } from 'util';
const compress = promisify(zlib.brotliCompress);

export class ProgressSavingReporter extends BaseReporter {
  private _cache: { [cacheDir: string]: Store } = {};
  private _promises: Promise<void>[] = [];

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
    await Promise.all(this._promises);
    for (const context of _contexts || []) {
      this._cache[context.config.cacheDirectory]?.markRunComplete();
    }
  }

  onTestStart(test?: Test) {
    if (test) {
      this._getCache(test).maybeMarkRunStart();
    }
  }

  async onTestResult(
    test: Test,
    testResult: TestResult,
    results: AggregatedResult,
  ): Promise<void> {
    super.onTestResult(test, testResult, results);
    const pid = projectId(test.context);
    const path = relativePath(test.context, testResult.testFilePath);
    const store = this._getCache(test);
    store.addOutcome(
      pid,
      path,
      testResult.perfStats.end,
      testResult.perfStats.runtime,
      testResult.numFailingTests,
    );
    const coverage = testResult.v8Coverage;
    if (coverage && 0 === testResult.numFailingTests) {
      this._promises.push(
        (async () => {
          const shrunk = await shrinkCoverage(test.context, coverage);
          const buffer = Buffer.from(JSON.stringify(shrunk), 'utf-8');
          const blob = await compress(buffer, {
            [zlib.constants.BROTLI_PARAM_MODE]: zlib.constants.BROTLI_MODE_TEXT,
          });
          store.addCoverage(pid, path, blob);
        })(),
      );
    }
  }
}
