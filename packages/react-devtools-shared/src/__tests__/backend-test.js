/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

function createWebSocket(): WebSocket {
  return {
    CLOSED: 3,
    OPEN: 1,
    readyState: 1,
    send: jest.fn(),
  } as any as WebSocket;
}

describe('connectToDevTools', () => {
  let connectToDevTools;
  let hook;

  beforeEach(() => {
    jest.resetModules();
    delete window.__REACT_DEVTOOLS_GLOBAL_HOOK__;

    const backend = require('react-devtools-core/src/backend');
    backend.initialize();
    connectToDevTools = backend.connectToDevTools;
    hook = window.__REACT_DEVTOOLS_GLOBAL_HOOK__;
  });

  afterEach(() => {
    jest.clearAllTimers();
    delete window.__REACT_DEVTOOLS_GLOBAL_HOOK__;
  });

  it('shuts down cleanly when the WebSocket closes', () => {
    const websocket = createWebSocket();
    const onShutdown = jest.fn();
    const unsubscribe = hook.sub('shutdown', onShutdown);

    try {
      connectToDevTools({websocket});
      websocket.onopen();
      websocket.readyState = websocket.CLOSED;
      websocket.onclose();
      jest.runAllTimers();

      expect(onShutdown).toHaveBeenCalledTimes(1);
      expect(global.consoleWarnMock).not.toHaveBeenCalledWith(
        'Bridge was already shutdown.',
      );
    } finally {
      unsubscribe();
    }
  });
});

describe('initialize', () => {
  beforeEach(() => {
    jest.resetModules();
    delete window.__REACT_DEVTOOLS_GLOBAL_HOOK__;
    global.IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    jest.clearAllTimers();
    delete window.__REACT_DEVTOOLS_GLOBAL_HOOK__;
  });

  // @reactVersion >= 18.0
  it('takes over the hook React Refresh installs when DevTools is not loaded yet', () => {
    // Without DevTools, React Refresh installs its own minimal hook.
    const ReactFreshRuntime = require('react-refresh/runtime');
    ReactFreshRuntime.injectIntoGlobalHook(window);
    const refreshHook = window.__REACT_DEVTOOLS_GLOBAL_HOOK__;

    const backend = require('react-devtools-core/src/backend');
    backend.initialize();
    const hook = window.__REACT_DEVTOOLS_GLOBAL_HOOK__;
    expect(hook).not.toBe(refreshHook);

    const websocket = createWebSocket();
    backend.connectToDevTools({websocket});
    websocket.onopen();

    const React = require('react');
    const ReactDOMClient = require('react-dom/client');
    const act = require('./utils').getActDOMImplementation();

    function Hello() {
      return 'Hello';
    }
    ReactFreshRuntime.register(Hello, 'Hello');

    const container = document.createElement('div');
    act(() => {
      ReactDOMClient.createRoot(container).render(<Hello />);
    });
    expect(container.textContent).toBe('Hello');

    // DevTools sees the renderer.
    expect(hook.rendererInterfaces.size).toBe(1);

    // Fast Refresh still sees the root and can update it.
    expect(ReactFreshRuntime._getMountedRootCount()).toBe(1);
    function HelloV2() {
      return 'Hello, world';
    }
    ReactFreshRuntime.register(HelloV2, 'Hello');
    act(() => {
      ReactFreshRuntime.performReactRefresh();
    });
    expect(container.textContent).toBe('Hello, world');
  });

  it('does not replace a hook that disables DevTools', () => {
    const disabledHook = {isDisabled: true};
    window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = disabledHook;

    require('react-devtools-core/src/backend').initialize();
    expect(window.__REACT_DEVTOOLS_GLOBAL_HOOK__).toBe(disabledHook);
  });
});
