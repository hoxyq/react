/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import typeof ReactTestRenderer from 'react-test-renderer';
import type Store from 'react-devtools-shared/src/devtools/store';

import {getVersionedRenderImplementation} from './utils';

describe('ComponentCounts', () => {
  let React;
  let TestRenderer: ReactTestRenderer;
  let store: Store;
  let utils;

  let ComponentCounts;
  let StoreContext;

  beforeEach(() => {
    utils = require('./utils');

    store = global.store;

    React = require('react');
    TestRenderer = utils.requireTestRenderer();

    ComponentCounts =
      require('react-devtools-shared/src/devtools/views/Components/ComponentCounts').default;
    StoreContext =
      require('react-devtools-shared/src/devtools/views/context').StoreContext;
  });

  const {render, unmount} = getVersionedRenderImplementation();

  function getRows(renderer) {
    return renderer.root
      .findAllByType('tr')
      .slice(1) // Skip the header row.
      .map(row => row.findAllByType('td').map(cell => cell.children.join('')));
  }

  // @reactVersion >= 18.0
  it('should show instance counts and update them as components mount and unmount', async () => {
    const Parent = ({count}) =>
      new Array(count).fill(true).map((_, index) => <Child key={index} />);
    const Child = () => null;

    await utils.actAsync(() => render(<Parent count={2} />));

    let renderer;
    await utils.actAsync(() => {
      renderer = TestRenderer.create(
        <StoreContext.Provider value={store}>
          <ComponentCounts />
        </StoreContext.Provider>,
      );
    });
    expect(getRows(renderer)).toEqual([
      ['Child', '2'],
      ['Parent', '1'],
    ]);

    await utils.actAsync(() => render(<Parent count={4} />));
    expect(getRows(renderer)).toEqual([
      ['Child', '4'],
      ['Parent', '1'],
    ]);

    await utils.actAsync(() => unmount());
    expect(renderer.toJSON()).toMatchInlineSnapshot(`
      <div>
        No components are mounted.
      </div>
    `);
  });
});
