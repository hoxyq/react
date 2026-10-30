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
  describe('setReactSelectionFromContextMenuTarget', () => {
    const {code, fn} = evalScripts.setReactSelectionFromContextMenuTarget;

    let previousHook;
    beforeEach(() => {
      previousHook = window.__REACT_DEVTOOLS_GLOBAL_HOOK__;
      window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {$0: null};
    });

    afterEach(() => {
      window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = previousHook;
      delete window.__REACT_DEVTOOLS_CONTEXT_MENU_TARGET__;
    });

    // The code is evaluated with chrome.devtools.inspectedWindow.eval(),
    // fn is used in the fallback eval context of the content script.
    describe.each([
      // eslint-disable-next-line no-eval
      ['inspected window eval', () => (0, eval)(code())],
      ['fallback eval context', () => fn()],
    ])('in %s', (name, evaluate) => {
      it('should copy the context menu target over to the hook', () => {
        const target = document.createElement('div');
        window.__REACT_DEVTOOLS_CONTEXT_MENU_TARGET__ = target;

        expect(evaluate()).toBe(true);
        expect(window.__REACT_DEVTOOLS_GLOBAL_HOOK__.$0).toBe(target);
      });

      it('should keep the selection if there is no context menu target', () => {
        const selectedElement = document.createElement('div');
        window.__REACT_DEVTOOLS_GLOBAL_HOOK__.$0 = selectedElement;

        expect(evaluate()).toBe(false);
        expect(window.__REACT_DEVTOOLS_GLOBAL_HOOK__.$0).toBe(selectedElement);
      });
    });
  });
});
