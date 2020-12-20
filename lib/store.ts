import * as path from 'path';

import connect = require('better-sqlite3');
import { Database } from 'better-sqlite3';
import { Test } from '@jest/reporters';

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

  constructor(db: Database) {
    this.db = db;
  }

  mostRecentRunFailed(path: string): boolean {
    return this.db
      .prepare(
        `select failures > 0
         from test_outcomes
         where test_name = ?
         order by occurred desc
         limit 1`,
      )
      .get(path)[0];
  }

  score(projectId: string, path: string): number {
    return this.db
      .prepare(
        `select sum(failures) * 10 + sum(duration) / count(1)
         from test_outcomes
         where test_name = ?`,
      )
      .get(path)[0];
  }

  maybeMarkRunStart() {
    this.runId = this.db
      .prepare(
        `insert into runs (started)
         values (?)`,
      )
      .run([Date.now()]).lastInsertRowid as number;
  }

  markRunComplete() {
    if (!this.runId) {
      return;
    }

    this.db
      .prepare(
        `update runs
         set finished=?
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
  return new Store(db);
}
