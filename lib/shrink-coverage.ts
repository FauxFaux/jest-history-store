import { V8CoverageResult } from '@jest/test-result';
import { SourceMapConsumer } from 'source-map';
import LineColumn = require('line-column');
import * as fs from 'fs';
import { relativePath } from './context';
import { Context } from '@jest/reporters';

type StartLine = number;
type EndLine = number;
type Hits = number;
type LineRange = [StartLine, EndLine, Hits];

interface ShrunkScriptCoverage {
  blockRanges: LineRange[];
  funcRanges: LineRange[];
}

export type ShrunkCoverage = {
  [script: string]: ShrunkScriptCoverage;
};

async function pick(
  script: V8CoverageResult[number],
  us: ShrunkScriptCoverage,
): Promise<void> {
  if (
    !script.codeTransformResult ||
    !script.codeTransformResult.sourceMapPath
  ) {
    throw new Error('no transform result');
  }

  // console.log(script.codeTransformResult);
  // console.log(script.codeTransformResult.code);
  // console.log(script.codeTransformResult.originalCode);
  // console.log(script.result);

  const lineMapper = LineColumn(script.codeTransformResult.code);
  const sourceMap = await new SourceMapConsumer(
    fs.readFileSync(script.codeTransformResult.sourceMapPath, 'utf-8'),
  );

  try {
    const orig = (offset: number) => {
      const unwrapped =
        offset - (script.codeTransformResult?.wrapperLength ?? 0);
      if (unwrapped <= 0) {
        return {
          line: 1,
          column: 0,
        };
      }
      const pos = lineMapper.fromIndex(unwrapped);
      if (!pos) {
        return null;
      }
      try {
        return sourceMap.originalPositionFor({
          line: pos.line,
          column: pos.col - 1,
        });
      } catch (e) {
        if (e instanceof RangeError) {
          throw new RangeError(
            `${e.message} at ${pos.line}:${pos.col} in ${script.result.url}`,
          );
        }
        throw e;
      }
    };

    for (const func of script.result.functions) {
      for (const range of func.ranges) {
        const start = orig(range.startOffset);
        const end = orig(range.endOffset);
        // console.log(
        //   range.startOffset,
        //   lineMapper.fromIndex(range.startOffset),
        //   start,
        //   range.endOffset,
        //   lineMapper.fromIndex(range.endOffset),
        //   end,
        // );
        if (!start?.line || !end?.line) {
          continue;
        }

        (func.isBlockCoverage ? us.blockRanges : us.funcRanges).push([
          start.line,
          end.line,
          range.count,
        ]);
      }
    }
  } finally {
    sourceMap.destroy();
  }
}

export async function shrinkCoverage(
  context: Context,
  coverage: V8CoverageResult,
) {
  const shrunk: ShrunkCoverage = {};
  for (const script of coverage) {
    const path = relativePath(context, script.result.url);
    shrunk[path] = { funcRanges: [], blockRanges: [] };
    const us = shrunk[path];
    await pick(script, us);
  }

  return shrunk;
}
