import * as path from 'path';
import * as zlib from 'zlib';
import { promisify } from 'util';

import { Database } from 'sqlite';
import * as sqlite3 from 'sqlite3';
import xdg = require('xdg-basedir');
import { ProjectId } from './context';

const compress = promisify(zlib.brotliCompress);

export type RunId = number;

// Assumption: generally being quite lax with test identity.
// A test is identified by its cache dir and its relative path.
// The default cache path (of `/tmp/jest_$(uid | base36)`) is shared
// across projects, so we may confuse `tests/index.test.js` in project 1
// and project 2.
export class Store {
  private readonly db: Database;

  async addOutcome(
    runId: RunId,
    testName: string,
    now: number,
    duration: number,
    failures: number,
    coverage: Buffer | null,
  ): Promise<void> {
    await this.db.run(
      `insert into test_outcomes
           (run_id, test_name, occurred, duration, failures, coverage)
       values (?, ?, ?, ?, ?, ?)`,
      [runId, testName, now, duration, failures, coverage],
    );
  }

  constructor(db: Database) {
    this.db = db;
  }

  async mostRecentRunFailed(path: string): Promise<boolean> {
    const resp = await this.db.get(
      `select failures > 0 failed
       from test_outcomes
       where test_name = ?
       order by occurred desc
       limit 1`,
      [path],
    );
    return resp.failed;
  }

  async score(projectId: string, path: string): Promise<number | undefined> {
    const resp = await this.db.get(
      `select (sum(failures) * 10 * 1000) + sum(duration) / count(1) as score
       from test_outcomes
       where test_name = ?`,
      [path],
    );
    return resp?.score;
  }

  async findSomeOutcomes(testName: string, pid: ProjectId, rootDir: string): Promise<number[]> {
    const proj = await this.db.all(
      `select id
       from test_outcomes_with_runs
       where test_name = ?
         and project_id = ?
         and root_dir = ?`
      , [testName, pid, rootDir],
    );
    if (proj.length) {
      return proj;
    }

    const root = await this.db.all(
      `select id
       from test_outcomes_with_runs
       where test_name = ?
         and root_dir = ?`
    , [testName, rootDir],);
    if (root.length) {
      return root;
    }

    return await this.db.all(
      `select id
       from test_outcomes_with_runs
       where test_name = ?`
    , [testName]);
  }

  async createRun(rootDir: string, pid: ProjectId): Promise<RunId> {
    const resp = await this.db.run(
      `insert into runs (root_dir, project_id, started, run_name)
       values (?, ?, ?, ?)`,
      [rootDir, pid, Date.now(), process.env.JEST_RUN_NAME],
    );
    if (resp.lastID === undefined) {
      throw new Error('missing insertion');
    }
    return resp.lastID;
  }

  async markRunComplete(runId: RunId): Promise<void> {
    await this.db.run(
      `update runs
       set finished = ?
       where id = ?`,
      [Date.now(), runId],
    );
  }
}

function defaultFilename() {
  const dir = xdg.data ?? process.cwd();
  return path.join(dir, 'jest-history-store.sqlite3');
}

// TODO: isn't this just a Promise<Store>?
export class StoreLoader {
  private readonly filename: string;
  private instance?: Store;

  constructor(filename = defaultFilename()) {
    this.filename = filename;
  }

  async load(): Promise<Store> {
    if (!this.instance) {
      this.instance = await create(this.filename);
    }

    return this.instance;
  }
}

export const processStore = new StoreLoader();

export async function create(filename: string): Promise<Store> {
  const db = new Database({filename, driver: sqlite3.Database});
  await db.open();
  await db.migrate({
    migrationsPath: path.join(__dirname, '..', 'migrations'),
  });
  return new Store(db);
}

export async function compressObj(obj: unknown): Promise<Buffer> {
  const buffer = Buffer.from(JSON.stringify(obj), 'utf-8');
  return await compress(buffer, {
    [zlib.constants.BROTLI_PARAM_MODE]: zlib.constants.BROTLI_MODE_TEXT,
  });
}
