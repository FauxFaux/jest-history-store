import * as path from 'path';
import { Database } from 'better-sqlite3';
import { Test } from '@jest/reporters';
import connect = require('better-sqlite3');

// Assumption: generally being quite lax with test identity.
// A test is identified by its cache dir and its relative path.
// The default cache path (of `/tmp/jest_$(uid | base36)`) is shared
// across projects, so we may confuse `tests/index.test.js` in project 1
// and project 2.
export class Store {
  private readonly db: Database;

  private runId: number | undefined;

  addOutcome(
    projectId: string,
    testName: string,
    now: number,
    duration: number,
    failures: number,
  ) {
    this.db
      .prepare(
        `insert into test_outcomes
             (project_id, test_name, occurred, duration, failures)
         values (?, ?, ?, ?, ?)`,
      )
      .run([projectId, testName, now, duration, failures]);
  }

  addCoverage(projectId: string, testName: string, coverage: unknown) {
    this.db
      .prepare(
        `insert into test_coverages
        (project_id, test_name, occurred, coverage)
        values (?, ?, ?, ?)`,
      )
      .run(projectId, testName, Date.now(), coverage);
  }

  constructor(db: Database) {
    this.db = db;
  }

  mostRecentRunFailed(path: string): boolean {
    return this.db
      .prepare(
        `select failures > 0 failed
         from test_outcomes
         where test_name = ?
         order by occurred desc
         limit 1`,
      )
      .get(path).failed;
  }

  score(projectId: string, path: string): number | undefined {
    return this.db
      .prepare(
        `select (sum(failures) * 10*1000) + sum(duration) / count(1) as score
         from test_outcomes
         where test_name = ?`,
      )
      .get(path)?.score;
  }

  maybeMarkRunStart() {
    if (undefined === this.runId) {
      this.runId = this.db
        .prepare(
          `insert into runs (started)
           values (?)`,
        )
        .run([Date.now()]).lastInsertRowid as number;
    }
  }

  markRunComplete() {
    if (!this.runId) {
      return;
    }

    this.db
      .prepare(
        `update runs
         set finished = ?
         where id = ?`,
      )
      .run([Date.now(), this.runId]);
    this.runId = undefined;
  }
}

export class StoreStore {
  private _cache: { [cacheDir: string]: Store } = {};

  cache(test: Test): Store {
    const dir = test.context.config.cacheDirectory;
    if (!this._cache[dir]) {
      this._cache[dir] = create(dir);
    }

    return this._cache[dir];
  }
}

export function create(cacheDir: string) {
  const fileName = path.join(cacheDir, 'result-history.sqlite3');
  let db = connect(fileName);
  db.exec(`
      create table if not exists test_outcomes
      (
          id         integer primary key,
          project_id varchar not null,
          test_name  varchar not null,
          occurred   integer not null,
          duration   real    not null,
          failures   integer not null
      )`);

  db.exec(`
      create table if not exists runs
      (
          id       integer primary key,
          started  integer not null,
          finished integer
      )`);

  db.exec(`
      create table if not exists test_coverages
      (
          id         integer primary key,
          project_id varchar not null,
          test_name  varchar not null,
          occurred   integer not null,
          coverage   blob not null
      )`);
  return new Store(db);
}
