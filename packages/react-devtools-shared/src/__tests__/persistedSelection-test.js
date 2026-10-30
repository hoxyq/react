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

describe('Persisted selection', () => {
  let React;
  let ReactDOMClient;
  let bridge: FrontendBridge;
  let store: Store;
  let utils;
  let act;
  let SESSION_STORAGE_LAST_SELECTION_KEY;

  let roots;

  beforeEach(() => {
    bridge = global.bridge;
    store = global.store;

    utils = require('./utils');
    act = utils.act;

    React = require('react');
    ReactDOMClient = require('react-dom/client');

    SESSION_STORAGE_LAST_SELECTION_KEY =
      require('react-devtools-shared/src/constants').SESSION_STORAGE_LAST_SELECTION_KEY;

    roots = [];
  });

  afterEach(() => {
    sessionStorage.removeItem(SESSION_STORAGE_LAST_SELECTION_KEY);
  });

  function render(element: React$Node, rootIndex: number = 0) {
    if (roots[rootIndex] === undefined) {
      roots[rootIndex] = ReactDOMClient.createRoot(
        document.createElement('div'),
      );
    }
    const root = roots[rootIndex];
    act(() => root.render(element));
  }

  // Connects a new frontend (Store) to a new backend (Agent),
  // which is what happens when DevTools is opened.
  function connectDevTools() {
    const Agent = require('react-devtools-shared/src/backend/agent').default;
    const {initBackend} = require('react-devtools-shared/src/backend');
    const Bridge = require('react-devtools-shared/src/bridge').default;
    const DevToolsStore =
      require('react-devtools-shared/src/devtools/store').default;

    const listeners = [];
    bridge = new Bridge({
      listen(callback) {
        listeners.push(callback);
        return () => {
          const index = listeners.indexOf(callback);
          if (index >= 0) {
            listeners.splice(index, 1);
          }
        };
      },
      send(event: string, payload: mixed) {
        listeners.forEach(callback => callback({event, payload}));
      },
    });
    store = new DevToolsStore(bridge);
    const agent = new Agent(bridge);
    act(() => {
      initBackend(global.__REACT_DEVTOOLS_GLOBAL_HOOK__, agent, global);
    });
  }

  // Emulates reloading the page. The app, React, and the DevTools hook,
  // backend and frontend are all created again. Only sessionStorage survives.
  function reload(renderApp: () => void, connectDevToolsFirst: boolean) {
    bridge.shutdown();
    act(() => roots.forEach(root => root.unmount()));
    roots = [];

    jest.resetModules();
    delete global.__REACT_DEVTOOLS_GLOBAL_HOOK__;
    const {installHook} = require('react-devtools-shared/src/hook');
    const {
      getDefaultComponentFilters,
    } = require('react-devtools-shared/src/utils');
    installHook(global, getDefaultComponentFilters());

    React = require('react');
    ReactDOMClient = require('react-dom/client');

    if (connectDevToolsFirst) {
      connectDevTools();
      renderApp();
    } else {
      // React usually renders before the DevTools backend gets injected.
      renderApp();
      connectDevTools();
    }
  }

  // Selecting an element in the Components tree makes the frontend inspect it.
  // That's how the backend learns about the new selection.
  function selectElement(id: number) {
    bridge.send('inspectElement', {
      forceFullData: true,
      id,
      path: null,
      rendererID: store.getRendererIDForElement(id),
      requestID: 0,
    });
    // Flush the Bridge without persisting the selection, which is throttled.
    jest.advanceTimersByTime(0);
  }

  function persistSelection() {
    jest.advanceTimersByTime(1000);
  }

  function getElementIDs(displayName: string, key: string | null = null) {
    const ids = [];
    const visit = (id: number) => {
      const element = store.getElementByID(id);
      if (element === null) {
        throw new Error(`Could not find element "${id}" in the Store.`);
      }
      if (element.displayName === displayName && element.key === key) {
        ids.push(id);
      }
      element.children.forEach(visit);
    };
    store.roots.forEach(visit);
    return ids;
  }

  function getElementID(displayName: string, key: string | null = null) {
    const ids = getElementIDs(displayName, key);
    if (ids.length !== 1) {
      throw new Error(
        `Expected to find one <${displayName}> but found ${ids.length}.`,
      );
    }
    return ids[0];
  }

  // The element that the backend told the frontend to select.
  function getSelectedElement(): string | null {
    const id = store.lastSelectedHostInstanceElementId;
    if (id === null) {
      return null;
    }
    const element = store.getElementByID(id);
    if (element === null) {
      throw new Error(`Selected element "${id}" is not in the Store.`);
    }
    return element.key === null
      ? `<${element.displayName}>`
      : `<${element.displayName} key="${element.key}">`;
  }

  const App = ({items}: {items: Array<string>}) => <List items={items} />;
  const List = ({items}: {items: Array<string>}) => (
    <ul>
      {items.map(item => (
        <Item key={item} label={item} />
      ))}
    </ul>
  );
  const Item = ({label}: {label: string}) => <li>{label}</li>;

  // @reactVersion >= 18.0
  it('should persist the path to the last selected element', () => {
    render(<App items={['a', 'b']} />);

    selectElement(getElementID('Item', 'a'));
    selectElement(getElementID('Item', 'b'));
    expect(sessionStorage.getItem(SESSION_STORAGE_LAST_SELECTION_KEY)).toBe(
      null,
    );

    persistSelection();
    expect(
      JSON.parse(sessionStorage.getItem(SESSION_STORAGE_LAST_SELECTION_KEY)),
    ).toMatchInlineSnapshot(`
      {
        "path": [
          {
            "displayName": "App:0",
            "index": 0,
            "key": null,
          },
          {
            "displayName": "App",
            "index": 0,
            "key": null,
          },
          {
            "displayName": "List",
            "index": 0,
            "key": null,
          },
          {
            "displayName": "ul",
            "index": 0,
            "key": null,
          },
          {
            "displayName": "Item",
            "index": 1,
            "key": "b",
          },
        ],
        "rendererID": 1,
      }
    `);
  });

  describe.each([
    ['before', true],
    ['after', false],
  ])('when DevTools connects %s React renders', (_, connectDevToolsFirst) => {
    // @reactVersion >= 18.0
    it('should restore the selection after a reload', () => {
      render(<App items={['a', 'b', 'c']} />);
      selectElement(getElementID('Item', 'b'));
      persistSelection();

      reload(
        () => render(<App items={['a', 'b', 'c']} />),
        connectDevToolsFirst,
      );
      expect(getSelectedElement()).toBe('<Item key="b">');
    });

    // @reactVersion >= 18.0
    it('should select the closest match if the selected element is gone after a reload', () => {
      render(<App items={['a', 'b', 'c']} />);
      selectElement(getElementID('Item', 'b'));
      persistSelection();

      reload(() => render(<App items={['a']} />), connectDevToolsFirst);
      expect(getSelectedElement()).toBe('<List>');
    });

    // @reactVersion >= 18.0
    it('should select the restored element once it mounts', () => {
      render(<App items={['a', 'b', 'c']} />);
      selectElement(getElementID('Item', 'b'));
      persistSelection();

      reload(() => render(<App items={[]} />), connectDevToolsFirst);
      expect(getSelectedElement()).toBe('<List>');

      render(<App items={['a', 'b', 'c']} />);
      expect(getSelectedElement()).toBe('<Item key="b">');
    });

    // @reactVersion >= 18.0
    it('should stop restoring the selection once another element is selected', () => {
      render(<App items={['a', 'b', 'c']} />);
      selectElement(getElementID('Item', 'b'));
      persistSelection();

      reload(() => render(<App items={[]} />), connectDevToolsFirst);
      expect(getSelectedElement()).toBe('<List>');

      selectElement(getElementID('App'));
      render(<App items={['a', 'b', 'c']} />);
      expect(getSelectedElement()).toBe('<List>');
    });

    // @reactVersion >= 18.0
    it('should restore the selection in the right root when roots have the same name', () => {
      render(<App items={['a', 'b']} />, 0);
      render(<App items={['a', 'b']} />, 1);
      selectElement(getElementIDs('Item', 'b')[1]);
      persistSelection();

      reload(() => {
        render(<App items={['a', 'b']} />, 0);
        render(<App items={['a', 'b']} />, 1);
      }, connectDevToolsFirst);
      expect(store.lastSelectedHostInstanceElementId).toBe(
        getElementIDs('Item', 'b')[1],
      );
    });

    // @reactVersion >= 19.0
    it('should restore the selection of a Server Component', () => {
      const ServerApp = () => {
        const child = <Item label="server" />;
        const promise: any = Promise.resolve(child);
        // Mark it as resolved so that React can unwrap it synchronously.
        promise.status = 'fulfilled';
        promise.value = child;
        promise._debugInfo = [
          {name: 'ServerComponent', env: 'Server', owner: null},
        ];
        return promise;
      };

      render(<ServerApp />);
      selectElement(getElementID('ServerComponent'));
      persistSelection();

      reload(() => render(<ServerApp />), connectDevToolsFirst);
      expect(getSelectedElement()).toBe('<ServerComponent>');
    });
  });

  // @reactVersion >= 18.0
  it('should restore the selection after DevTools is reopened', () => {
    render(<App items={['a', 'b', 'c']} />);
    selectElement(getElementID('Item', 'b'));
    persistSelection();

    bridge.shutdown();
    connectDevTools();
    expect(getSelectedElement()).toBe('<Item key="b">');
  });

  // @reactVersion >= 18.0
  it('should keep the selection when component filters change', () => {
    render(<App items={['a', 'b', 'c']} />);
    selectElement(getElementID('Item', 'b'));

    act(() => {
      store.componentFilters = [
        ...store.componentFilters,
        utils.createDisplayNameFilter('^List$'),
      ];
    });
    expect(getSelectedElement()).toBe('<Item key="b">');
  });

  // @reactVersion >= 18.0
  it('should select the closest match when the selected element gets filtered out', () => {
    render(<App items={['a', 'b', 'c']} />);
    selectElement(getElementID('List'));

    act(() => {
      store.componentFilters = [
        ...store.componentFilters,
        utils.createDisplayNameFilter('^List$'),
      ];
    });
    expect(getSelectedElement()).toBe('<App>');
  });
});
