/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import {getVersionedRenderImplementation} from './utils';

describe('useOpenResource', () => {
  let act;
  let React;
  let useOpenResource;
  let ViewElementSourceContext;
  let LOCAL_STORAGE_ALWAYS_OPEN_IN_EDITOR;
  let LOCAL_STORAGE_OPEN_IN_EDITOR_URL;

  let originalWindowOpen;

  beforeEach(() => {
    const utils = require('./utils');
    act = utils.act;

    React = require('react');

    useOpenResource = require('../devtools/views/useOpenResource').default;
    ViewElementSourceContext =
      require('../devtools/views/Components/ViewElementSourceContext').default;
    ({
      LOCAL_STORAGE_ALWAYS_OPEN_IN_EDITOR,
      LOCAL_STORAGE_OPEN_IN_EDITOR_URL,
    } = require('../constants'));

    originalWindowOpen = window.open;
    window.open = jest.fn();
  });

  afterEach(() => {
    window.open = originalWindowOpen;
    localStorage.clear();
  });

  const {render} = getVersionedRenderImplementation();

  // The source map listed an absolute path, which was resolved against the source map URL.
  const source = ['', 'https://cdn.test/app.js', 1, 100];
  const symbolicatedSource = {
    location: ['App', 'https://sourcemaps.test/Users/me/app/App.js', 10, 5],
    editorLocation: ['App', '/Users/me/app/App.js', 10, 5],
    ignored: false,
  };

  function renderAndViewSource(viewElementSourceFunction) {
    let result;
    function Example() {
      result = useOpenResource(source, symbolicatedSource);
      return null;
    }

    act(() =>
      render(
        <ViewElementSourceContext.Provider
          value={{
            canViewElementSourceFunction: null,
            viewElementSourceFunction,
          }}>
          <Example />
        </ViewElementSourceContext.Provider>,
      ),
    );

    const [isEnabled, viewSource] = result;
    expect(isEnabled).toBe(true);
    viewSource();
  }

  it('should view the source by its resolved URL', () => {
    const viewElementSourceFunction = jest.fn();
    renderAndViewSource(viewElementSourceFunction);

    expect(viewElementSourceFunction).toHaveBeenCalledTimes(1);
    expect(viewElementSourceFunction).toHaveBeenCalledWith(
      source,
      symbolicatedSource.location,
    );
    expect(window.open).not.toHaveBeenCalled();
  });

  it('should open the source in the editor by its path', () => {
    localStorage.setItem(LOCAL_STORAGE_ALWAYS_OPEN_IN_EDITOR, 'true');
    localStorage.setItem(
      LOCAL_STORAGE_OPEN_IN_EDITOR_URL,
      JSON.stringify('vscode://file/{path}:{line}:{column}'),
    );

    const viewElementSourceFunction = jest.fn();
    renderAndViewSource(viewElementSourceFunction);

    expect(viewElementSourceFunction).not.toHaveBeenCalled();
    expect(window.open).toHaveBeenCalledTimes(1);
    expect(window.open.mock.calls[0][0].href).toBe(
      'vscode://file//Users/me/app/App.js:10:5',
    );
  });
});
