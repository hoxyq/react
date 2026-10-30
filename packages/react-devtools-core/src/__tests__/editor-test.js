/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import {getValidFilePath} from '../editor';

describe('editor', () => {
  describe('getValidFilePath', () => {
    it('should return existing absolute paths', () => {
      expect(getValidFilePath(__filename, [])).toBe(__filename);
      expect(getValidFilePath(__filename + '.missing', [])).toBe(null);
    });

    it('should return existing absolute paths that were resolved against a source map URL', () => {
      expect(getValidFilePath('http://localhost:8081' + __filename, [])).toBe(
        __filename,
      );
      expect(getValidFilePath('http://localhost:8081/index.bundle', [])).toBe(
        null,
      );
    });
  });
});
