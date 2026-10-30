/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

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

  function createWebSocket(): WebSocket {
    return {
      CLOSED: 3,
      OPEN: 1,
      readyState: 1,
      send: jest.fn(),
    } as any as WebSocket;
  }

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

describe('connecting after React has committed', () => {
  let React;
  let ReactDOMClient;
  let act;
  let withErrorsOrWarningsIgnored;
  let backend;

  beforeEach(() => {
    jest.resetModules();
    delete window.__REACT_DEVTOOLS_GLOBAL_HOOK__;
  });

  afterEach(() => {
    jest.clearAllTimers();
    delete window.__REACT_DEVTOOLS_GLOBAL_HOOK__;
  });

  function initialize(shouldStartProfilingNow: boolean = false) {
    backend = require('react-devtools-core/src/backend');
    backend.initialize(undefined, shouldStartProfilingNow);

    React = require('react');
    ReactDOMClient = require('react-dom/client');
    const utils = require('./utils');
    act = utils.act;
    withErrorsOrWarningsIgnored = utils.withErrorsOrWarningsIgnored;
  }

  function connect() {
    const Bridge = require('react-devtools-shared/src/bridge').default;
    const Store = require('react-devtools-shared/src/devtools/store').default;

    const backendListeners = [];
    const frontendListeners = [];
    const sentOperations = [];
    const bridge = new Bridge({
      listen(callback) {
        frontendListeners.push(callback);
        return () => {};
      },
      send(event, payload) {
        backendListeners.forEach(callback => callback({event, payload}));
      },
    });
    const store = new Store(bridge);
    backend.connectWithCustomMessagingProtocol({
      onSubscribe(callback) {
        backendListeners.push(callback);
      },
      onUnsubscribe() {},
      onMessage(event, payload) {
        if (event === 'operations') {
          sentOperations.push(payload);
        }
        frontendListeners.forEach(callback => callback({event, payload}));
      },
    });
    jest.runAllTimers();
    return {store, sentOperations};
  }

  function getRendererInterface() {
    // React DOM is the first renderer to inject itself.
    return window.__REACT_DEVTOOLS_GLOBAL_HOOK__.rendererInterfaces.get(1);
  }

  // @reactVersion >= 18.0
  it('only sends the current tree', () => {
    initialize();
    function Child() {
      return null;
    }
    const root = ReactDOMClient.createRoot(document.createElement('div'));
    for (let i = 0; i < 10; i++) {
      act(() => root.render(<Child key={i} />));
    }

    const {store, sentOperations} = connect();
    expect(sentOperations).toHaveLength(1);
    expect(store).toMatchInlineSnapshot(`
      [root]
          <Child key="9">
    `);

    act(() => root.render(<Child key="next" />));
    expect(sentOperations).toHaveLength(2);
    expect(store).toMatchInlineSnapshot(`
      [root]
          <Child key="next">
    `);
  });

  // @reactVersion >= 18.0
  it('mounts a root without children once it renders some', () => {
    initialize();
    function Child() {
      return null;
    }
    const root = ReactDOMClient.createRoot(document.createElement('div'));
    const otherRoot = ReactDOMClient.createRoot(document.createElement('div'));
    act(() => root.render(<Child key="root" />));
    act(() => otherRoot.render(false));

    const {store} = connect();
    expect(store).toMatchInlineSnapshot(`
      [root]
          <Child key="root">
    `);

    act(() => otherRoot.render(<Child key="otherRoot" />));
    expect(store).toMatchInlineSnapshot(`
      [root]
          <Child key="root">
      [root]
          <Child key="otherRoot">
    `);
  });

  // @reactVersion >= 18.0
  it('applies component filters updated before connecting', () => {
    initialize();
    function Child() {
      return null;
    }
    function Parent() {
      return <Child />;
    }
    const root = ReactDOMClient.createRoot(document.createElement('div'));
    act(() => root.render(<Parent />));

    const {
      ComponentFilterDisplayName,
    } = require('react-devtools-shared/src/frontend/types');
    const {
      getDefaultComponentFilters,
    } = require('react-devtools-shared/src/utils');
    getRendererInterface().updateComponentFilters([
      ...getDefaultComponentFilters(),
      {
        type: ComponentFilterDisplayName,
        value: '^Child$',
        isEnabled: true,
        isValid: true,
      },
    ]);

    const {store} = connect();
    expect(store).toMatchInlineSnapshot(`
      [root]
          <Parent>
    `);
  });

  // @reactVersion >= 18.0
  it('shows errors and warnings logged before connecting', () => {
    initialize();
    function Child() {
      console.warn('test-only: render warning');
      React.useEffect(() => {
        console.error('test-only: passive error');
      }, []);
      return null;
    }
    const root = ReactDOMClient.createRoot(document.createElement('div'));
    withErrorsOrWarningsIgnored(['test-only:'], () => {
      act(() => root.render(<Child />));
    });

    const {store} = connect();
    expect(store).toMatchInlineSnapshot(`
      ✕ 1, ⚠ 1
      [root]
          <Child> ✕⚠
    `);
  });

  // @reactVersion >= 18.0
  it('sends every commit when profiling started before connecting', () => {
    initialize(true);
    function Child() {
      return null;
    }
    const root = ReactDOMClient.createRoot(document.createElement('div'));
    for (let i = 0; i < 3; i++) {
      act(() => root.render(<Child key={i} />));
    }

    const {store, sentOperations} = connect();
    expect(sentOperations).toHaveLength(3);
    expect(store).toMatchInlineSnapshot(`
      [root]
          <Child key="2">
    `);

    const rendererInterface = getRendererInterface();
    rendererInterface.stopProfiling();
    const {dataForRoots} = rendererInterface.getProfilingData();
    expect(dataForRoots).toHaveLength(1);
    expect(dataForRoots[0].commitData).toHaveLength(3);
  });

  // @reactVersion >= 18.0
  it('sends the tree and every profiled commit when profiling starts before connecting', () => {
    initialize();
    function Child() {
      return null;
    }
    const root = ReactDOMClient.createRoot(document.createElement('div'));
    act(() => root.render(<Child key="before" />));

    const rendererInterface = getRendererInterface();
    rendererInterface.startProfiling(false);
    act(() => root.render(<Child key="profiled" />));
    rendererInterface.stopProfiling();
    act(() => root.render(<Child key="after" />));

    // The tree when profiling started, the profiled commit, and the commit after.
    const {store, sentOperations} = connect();
    expect(sentOperations).toHaveLength(3);
    expect(store).toMatchInlineSnapshot(`
      [root]
          <Child key="after">
    `);
    const {dataForRoots} = rendererInterface.getProfilingData();
    expect(dataForRoots).toHaveLength(1);
    expect(dataForRoots[0].commitData).toHaveLength(1);
  });
});
