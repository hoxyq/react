/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import SourceMapConsumer from 'react-devtools-shared/src/hooks/SourceMapConsumer';

import type {ReactFunctionLocation} from 'shared/ReactTypes';
import type {FetchFileWithCaching} from 'react-devtools-shared/src/devtools/views/Components/FetchFileWithCachingContext';

const symbolicationCache: Map<
  string,
  Promise<SourceMappedLocation | null>,
> = new Map();

export type SourceMappedLocation = {
  location: ReactFunctionLocation,
  // Set if the source map lists an absolute path, like /Users/me/app/x.js.
  // The location has it resolved against the source map URL, like browsers do,
  // but it may be a file on the disk, which code editors can only open by path.
  editorLocation?: ReactFunctionLocation,
  ignored: boolean, // Whether the file for this location was ignore listed
};

export function symbolicateSourceWithCache(
  fetchFileWithCaching: FetchFileWithCaching,
  sourceURL: string,
  line: number, // 1-based
  column: number, // 1-based
): Promise<SourceMappedLocation | null> {
  const key = `${sourceURL}:${line}:${column}`;
  const cachedPromise = symbolicationCache.get(key);
  if (cachedPromise != null) {
    return cachedPromise;
  }

  const promise = symbolicateSource(
    fetchFileWithCaching,
    sourceURL,
    line,
    column,
  );
  symbolicationCache.set(key, promise);

  return promise;
}

const SOURCE_MAP_ANNOTATION_PREFIX = 'sourceMappingURL=';
export async function symbolicateSource(
  fetchFileWithCaching: FetchFileWithCaching,
  sourceURL: string,
  lineNumber: number, // 1-based
  columnNumber: number, // 1-based
): Promise<SourceMappedLocation | null> {
  if (!sourceURL || sourceURL.startsWith('<anonymous')) {
    return null;
  }
  const resource = await fetchFileWithCaching(sourceURL).catch(() => null);
  if (resource == null) {
    return null;
  }

  const resourceLines = resource.split(/[\r\n]+/);
  for (let i = resourceLines.length - 1; i >= 0; --i) {
    const resourceLine = resourceLines[i];

    // In case there is empty last line
    if (!resourceLine) continue;
    // Not an annotation? Stop looking for a source mapping url.
    if (!resourceLine.startsWith('//#')) break;

    if (resourceLine.includes(SOURCE_MAP_ANNOTATION_PREFIX)) {
      const sourceMapAnnotationStartIndex = resourceLine.indexOf(
        SOURCE_MAP_ANNOTATION_PREFIX,
      );
      const sourceMapAt = resourceLine.slice(
        sourceMapAnnotationStartIndex + SOURCE_MAP_ANNOTATION_PREFIX.length,
        resourceLine.length,
      );

      // Compute the absolute source map URL. If the base URL is invalid, gracefully bail.
      let sourceMapURL;
      try {
        sourceMapURL = new URL(sourceMapAt, sourceURL).toString();
      } catch (e) {
        // Fallback: try if sourceMapAt is already an absolute URL; otherwise give up.
        try {
          sourceMapURL = new URL(sourceMapAt).toString();
        } catch (_e) {
          return null;
        }
      }
      const sourceMap = await fetchFileWithCaching(sourceMapURL).catch(
        () => null,
      );
      if (sourceMap != null) {
        try {
          const parsedSourceMap = JSON.parse(sourceMap);
          const consumer = SourceMapConsumer(parsedSourceMap);
          const functionName = ''; // TODO: Parse function name from sourceContent.
          const {
            sourceURL: possiblyURL,
            line,
            column: columnZeroBased,
            ignored,
          } = consumer.originalPositionFor({
            lineNumber, // 1-based
            columnNumber, // 1-based
          });

          const column = columnZeroBased + 1;

          if (possiblyURL === null) {
            return null;
          }
          try {
            // sourceMapURL = https://react.dev/script.js.map
            void new URL(possiblyURL); // test if it is a valid URL

            return {
              location: [functionName, possiblyURL, line, column],
              ignored,
            };
          } catch (e) {
            // This is not valid URL
            if (
              // sourceMapURL = C:\\...
              possiblyURL.slice(1).startsWith(':\\\\')
            ) {
              // This is an absolute path
              return {
                location: [functionName, possiblyURL, line, column],
                ignored,
              };
            }

            if (possiblyURL.startsWith('/')) {
              // This is an absolute path, but not an absolute URL, so browsers resolve it
              // against the source map URL. Do the same to find it in the browser's DevTools.
              // possiblyURL = /src/x.js, sourceMapURL = https://react.dev/script.js.map
              // -> https://react.dev/src/x.js
              const editorLocation: ReactFunctionLocation = [
                functionName,
                possiblyURL,
                line,
                column,
              ];
              let absoluteSourceURL;
              try {
                absoluteSourceURL = new URL(
                  possiblyURL,
                  sourceMapURL,
                ).toString();
              } catch (_e) {
                // The source map URL can't be a base, e.g. it's a data: URL.
                return {location: editorLocation, ignored};
              }
              return {
                location: [functionName, absoluteSourceURL, line, column],
                editorLocation,
                ignored,
              };
            }

            // This is a relative path
            // possiblyURL = x.js.map, sourceMapURL = https://react.dev/script.js.map
            const absoluteSourcePath = new URL(
              possiblyURL,
              sourceMapURL,
            ).toString();
            return {
              location: [functionName, absoluteSourcePath, line, column],
              ignored,
            };
          }
        } catch (e) {
          return null;
        }
      }

      return null;
    }
  }

  return null;
}
