import { AggregatedResult, BaseReporter, Context, Test, TestResult, } from '@jest/reporters';

import { compressObj, processStore, RunId, StoreLoader } from './store';
import { ProjectId, projectId, relativePath } from './context';
import { shrinkCoverage } from './shrink-coverage';

export class ProgressSavingReporter extends BaseReporter {
  private readonly store: StoreLoader;
  private readonly projectRun: Record<ProjectId, RunId | null> = {};

  constructor(/* passed in by jest */) {
    super();
    this.store = processStore;
  }

  async onRunComplete(
    contexts?: Set<Context>,
    _aggregatedResults?: AggregatedResult,
  ): Promise<void> {
    await super.onRunComplete(contexts, _aggregatedResults);
    const store = await this.store.load();
    for (const context of contexts || []) {
      const pid = projectId(context);
      const run = this.projectRun[pid];
      if (null != run) {
        await store.markRunComplete(run);
      }
    }
  }

  async onTestStart(test?: Test): Promise<void> {
    await super.onTestStart(test);
    if (!test) {
      return;
    }
    const pid = projectId(test.context);
    if (pid in this.projectRun) {
      return;
    }
    // Races? I think this needs race protection;
    // Two tests could start in parallel, at least in theory.
    this.projectRun[pid] = null;
    const store = await this.store.load();
    this.projectRun[pid] = await store.createRun(
      test.context.config.rootDir,
      pid,
    );
  }

  async onTestResult(
    test: Test,
    testResult: TestResult,
    results: AggregatedResult,
  ): Promise<void> {
    await super.onTestResult(test, testResult, results);
    const pid = projectId(test.context);
    const path = relativePath(test.context, testResult.testFilePath);
    const store = await this.store.load();
    let coverageBlob = null;

    const coverage = testResult.v8Coverage;
    if (coverage && 0 === testResult.numFailingTests) {
      coverageBlob = await compressObj(await shrinkCoverage(test.context, coverage));
    }

    const runId = this.projectRun[pid];
    if (runId == null) {
      throw new Error(`illegal state; test result in project which hadn't started: ${pid}`);
    }

    await store.addOutcome(
      runId,
      path,
      testResult.perfStats.end,
      testResult.perfStats.runtime,
      testResult.numFailingTests,
      coverageBlob,
    );
  }
}
