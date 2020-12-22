import { Context } from '@jest/reporters';

// close enough
function slash(path: string): string {
  return path.replace(/\\/g, '/');
}

export function relativePath(
  context: Pick<Context, 'config'>,
  testPath: string,
): string {
  let root = slash(context.config.rootDir);
  if (!root.endsWith('/')) {
    root += '/';
  }

  testPath = slash(testPath);

  if (testPath.startsWith(root)) {
    return testPath.substr(root.length);
  }

  return testPath;
}

export function projectId(context: Context): string {
  return context.config.name;
}
