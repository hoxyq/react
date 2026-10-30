/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import {getVersionedRenderImplementation} from './utils';

describe('SearchInput', () => {
  let act;
  let React;
  let SearchInput;

  beforeEach(() => {
    const utils = require('./utils');
    act = utils.act;

    React = require('react');

    SearchInput = require('../devtools/views/SearchInput').default;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const {render, unmount, getContainer} = getVersionedRenderImplementation();

  function renderSearchInput() {
    const noop = () => {};
    act(() =>
      render(
        <SearchInput
          goToNextResult={noop}
          goToPreviousResult={noop}
          goToResult={noop}
          placeholder="Search"
          search={noop}
          searchIndex={0}
          searchResultsCount={0}
          searchText=""
        />,
      ),
    );

    const input = getContainer().querySelector('input');
    expect(document.activeElement).not.toBe(input);
    return input;
  }

  function pressF(modifiers: {ctrlKey?: boolean, metaKey?: boolean}) {
    const event = new KeyboardEvent('keydown', {
      key: 'f',
      bubbles: true,
      cancelable: true,
      ...modifiers,
    });
    document.documentElement.dispatchEvent(event);
    return event;
  }

  it('should focus the input on Ctrl+F on Windows and Linux', () => {
    jest.spyOn(navigator, 'platform', 'get').mockReturnValue('Win32');
    const input = renderSearchInput();

    // Win+F is reserved by Windows, so it should be left alone.
    expect(pressF({metaKey: true}).defaultPrevented).toBe(false);
    expect(document.activeElement).not.toBe(input);

    expect(pressF({ctrlKey: true}).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(input);

    act(() => unmount());
  });

  it('should focus the input on Cmd+F on Mac', () => {
    jest.spyOn(navigator, 'platform', 'get').mockReturnValue('MacIntel');
    const input = renderSearchInput();

    // Ctrl+F moves the caret forward in macOS text fields, so leave it alone.
    expect(pressF({ctrlKey: true}).defaultPrevented).toBe(false);
    expect(document.activeElement).not.toBe(input);

    expect(pressF({metaKey: true}).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(input);

    act(() => unmount());
  });
});
