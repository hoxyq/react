/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import type {FrontendBridge} from 'react-devtools-shared/src/bridge';
import type Store from 'react-devtools-shared/src/devtools/store';

describe('InspectHostNodesToggle', () => {
  let React;
  let ReactDOMClient;
  let bridge: FrontendBridge;
  let store: Store;
  let utils;

  let BridgeContext;
  let InspectHostNodesToggle;
  let SettingsContextController;
  let StoreContext;

  let container: HTMLElement;
  let root;

  beforeEach(() => {
    utils = require('./utils');

    bridge = global.bridge;
    store = global.store;

    React = require('react');
    ReactDOMClient = require('react-dom/client');

    BridgeContext =
      require('react-devtools-shared/src/devtools/views/context').BridgeContext;
    InspectHostNodesToggle =
      require('react-devtools-shared/src/devtools/views/Components/InspectHostNodesToggle').default;
    SettingsContextController =
      require('react-devtools-shared/src/devtools/views/Settings/SettingsContext').SettingsContextController;
    StoreContext =
      require('react-devtools-shared/src/devtools/views/context').StoreContext;

    container = document.createElement('div');
    document.body.appendChild(container);
    root = ReactDOMClient.createRoot(container);
  });

  afterEach(() => {
    utils.act(() => root.unmount());
    document.body.removeChild(container);
  });

  function Tab({
    hidden = false,
    onlySuspenseNodes,
  }: {
    hidden?: boolean,
    onlySuspenseNodes?: boolean,
  }) {
    const ref = React.useRef<HTMLDivElement | null>(null);
    return (
      <div hidden={hidden}>
        <div ref={ref}>
          <InspectHostNodesToggle
            containerRef={ref}
            onlySuspenseNodes={onlySuspenseNodes}
          />
        </div>
      </div>
    );
  }

  function renderTabs(children: React$Node) {
    utils.act(() =>
      root.render(
        <BridgeContext.Provider value={bridge}>
          <StoreContext.Provider value={store}>
            <SettingsContextController browserTheme="light">
              {children}
            </SettingsContextController>
          </StoreContext.Provider>
        </BridgeContext.Provider>,
      ),
    );
  }

  function pressShortcut(overrides?: {...}) {
    const isMac =
      typeof navigator !== 'undefined' &&
      navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const ownerWindow = container.ownerDocument.defaultView;
    const event = new KeyboardEvent('keydown', {
      key: 'C',
      metaKey: isMac,
      ctrlKey: !isMac,
      shiftKey: true,
      bubbles: true,
      cancelable: true,
      ...overrides,
    });
    utils.act(() => {
      ownerWindow.dispatchEvent(event);
    });
    return event;
  }

  function getInspectingMessages(sendSpy) {
    return sendSpy.mock.calls.filter(
      ([event]) =>
        event === 'startInspectingHost' || event === 'stopInspectingHost',
    );
  }

  it('should toggle inspecting when the keyboard shortcut is pressed', () => {
    renderTabs(<Tab />);
    const sendSpy = jest.spyOn(bridge, 'send');

    // Shift is required.
    pressShortcut({shiftKey: false});
    expect(getInspectingMessages(sendSpy)).toEqual([]);

    const event = pressShortcut();
    expect(event.defaultPrevented).toBe(true);
    expect(getInspectingMessages(sendSpy)).toEqual([
      ['startInspectingHost', false],
    ]);

    pressShortcut();
    expect(getInspectingMessages(sendSpy)).toEqual([
      ['startInspectingHost', false],
      ['stopInspectingHost'],
    ]);
  });

  it('should only respond to the shortcut in the visible tab', () => {
    renderTabs(
      <>
        <Tab hidden={true} />
        <Tab onlySuspenseNodes={true} />
      </>,
    );
    const sendSpy = jest.spyOn(bridge, 'send');

    pressShortcut();
    expect(getInspectingMessages(sendSpy)).toEqual([
      ['startInspectingHost', true],
    ]);

    pressShortcut();
    expect(getInspectingMessages(sendSpy)).toEqual([
      ['startInspectingHost', true],
      ['stopInspectingHost'],
    ]);
  });
});
