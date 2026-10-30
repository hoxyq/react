/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import {evalScripts} from '../evalScripts';

describe('evalScripts', () => {
  describe('setBrowserSelectionFromReact', () => {
    // Evaluates the script like inspectedWindow.eval() does,
    // with the Console Utilities $0 and inspect() in scope.
    function evaluate(hookSelectedNode: mixed, browserSelectedNode: mixed) {
      const inspect = jest.fn(node => node);
      const window = {
        __REACT_DEVTOOLS_GLOBAL_HOOK__: {$0: hookSelectedNode},
      };
      // eslint-disable-next-line no-new-func
      const result = new Function(
        'window',
        '$0',
        'inspect',
        'return ' + evalScripts.setBrowserSelectionFromReact.code(),
      )(window, browserSelectedNode, inspect);
      return {inspect, result};
    }

    it('should inspect the host instance selected in React', () => {
      const node = document.createElement('div');
      const {inspect, result} = evaluate(node, document.body);

      expect(inspect).toHaveBeenCalledTimes(1);
      expect(inspect).toHaveBeenCalledWith(node);
      expect(result).toBe(true);
    });

    // https://github.com/react/react/issues/16965
    it('should inspect the host instance even if the browser already selected it', () => {
      const node = document.createElement('div');
      const {inspect, result} = evaluate(node, node);

      expect(inspect).toHaveBeenCalledTimes(1);
      expect(inspect).toHaveBeenCalledWith(node);
      expect(result).toBe(true);
    });
  });
});
