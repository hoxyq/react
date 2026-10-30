/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import typeof ReactTestRenderer from 'react-test-renderer';
import type {FrontendBridge} from 'react-devtools-shared/src/bridge';
import type {Context} from 'react-devtools-shared/src/devtools/views/Profiler/ProfilerContext';
import type Store from 'react-devtools-shared/src/devtools/store';

import {getVersionedRenderImplementation} from './utils';

describe('SidebarSelectedFiberInfo', () => {
  let React;
  let Scheduler;
  let TestRenderer: ReactTestRenderer;
  let bridge: FrontendBridge;
  let store: Store;
  let utils;

  let BridgeContext;
  let ProfilerContext;
  let ProfilerContextController;
  let SettingsContextController;
  let SidebarSelectedFiberInfo;
  let StoreContext;
  let TreeContextController;

  beforeEach(() => {
    utils = require('./utils');
    utils.beforeEachProfiling();

    bridge = global.bridge;
    store = global.store;
    store.collapseNodesByDefault = false;
    store.recordChangeDescriptions = true;

    React = require('react');
    Scheduler = require('scheduler');
    TestRenderer = utils.requireTestRenderer();

    BridgeContext =
      require('react-devtools-shared/src/devtools/views/context').BridgeContext;
    ProfilerContext =
      require('react-devtools-shared/src/devtools/views/Profiler/ProfilerContext').ProfilerContext;
    ProfilerContextController =
      require('react-devtools-shared/src/devtools/views/Profiler/ProfilerContext').ProfilerContextController;
    SettingsContextController =
      require('react-devtools-shared/src/devtools/views/Settings/SettingsContext').SettingsContextController;
    SidebarSelectedFiberInfo =
      require('react-devtools-shared/src/devtools/views/Profiler/SidebarSelectedFiberInfo').default;
    StoreContext =
      require('react-devtools-shared/src/devtools/views/context').StoreContext;
    TreeContextController =
      require('react-devtools-shared/src/devtools/views/Components/TreeContext').TreeContextController;
  });

  const {render} = getVersionedRenderImplementation();

  const Contexts = ({children}: {children: React$Node}) => (
    <BridgeContext.Provider value={bridge}>
      <StoreContext.Provider value={store}>
        <SettingsContextController browserTheme="light">
          <TreeContextController>
            <ProfilerContextController>{children}</ProfilerContextController>
          </TreeContextController>
        </SettingsContextController>
      </StoreContext.Provider>
    </BridgeContext.Provider>
  );

  function getTextContent(instance: any): string {
    return instance.children
      .map(child => (typeof child === 'string' ? child : getTextContent(child)))
      .join('');
  }

  // @reactVersion >= 16.9
  it('should list render durations of the selected component rather than of the whole commit', async () => {
    const Parent = ({duration}: {duration: number}) => {
      Scheduler.unstable_advanceTime(10);
      return <Child duration={duration} />;
    };
    const Child = ({duration}: {duration: number}) => {
      Scheduler.unstable_advanceTime(duration);
      return null;
    };

    utils.act(() => store.profilerStore.startProfiling());
    utils.act(() => render(<Parent duration={2} />));
    utils.act(() => render(<Parent duration={5} />));
    utils.act(() => store.profilerStore.stopProfiling());

    expect(store).toMatchInlineSnapshot(`
      [root]
        ▾ <Parent>
            <Child>
    `);

    const parentID = ((store.getElementIDAtIndex(0): any): number);
    const childID = ((store.getElementIDAtIndex(1): any): number);

    let context: Context = ((null: any): Context);
    function ContextReader() {
      context = React.useContext(ProfilerContext);
      return null;
    }

    let renderer;
    await utils.actAsync(() => {
      renderer = TestRenderer.create(
        <Contexts>
          <ContextReader />
          <SidebarSelectedFiberInfo />
        </Contexts>,
      );
    });

    function getRenderedAtListItems() {
      return renderer.root
        .findAll(instance => instance.type === 'button')
        .map(getTextContent)
        .filter(text => text.includes(' for '))
        .map(text => text.replace(/^[\d.]+s for /, ''));
    }

    // The commit durations are 12ms and 15ms, but the list should show the
    // self and actual durations of the selected component, like the tooltip.
    await utils.actAsync(() => context.selectFiber(childID, 'Child'));
    expect(getRenderedAtListItems()).toEqual(['2ms of 2ms', '5ms of 5ms']);

    await utils.actAsync(() => context.selectFiber(parentID, 'Parent'));
    expect(getRenderedAtListItems()).toEqual(['10ms of 12ms', '10ms of 15ms']);
  });
});
