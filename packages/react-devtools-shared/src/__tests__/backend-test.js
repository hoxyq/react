/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import {
  ComponentFilterActivitySlice,
  ComponentFilterDisplayName,
  ComponentFilterElementType,
  ComponentFilterLocation,
  ElementTypeHostComponent,
} from 'react-devtools-shared/src/frontend/types';

import type {ComponentFilter} from 'react-devtools-shared/src/frontend/types';

const updatedComponentFilters: Array<ComponentFilter> = [
  {
    type: ComponentFilterElementType,
    value: ElementTypeHostComponent,
    isEnabled: true,
  },
  {
    type: ComponentFilterDisplayName,
    value: 'Foo',
    isEnabled: true,
    isValid: true,
  },
  {
    type: ComponentFilterLocation,
    value: 'node_modules',
    isEnabled: true,
    isValid: true,
  },
  {
    type: ComponentFilterActivitySlice,
    activityID: 1,
    rendererID: 1,
    isEnabled: true,
    isValid: true,
  },
];

// Location and activity slice filters can't be restored after a reload.
const persistedComponentFilters: Array<ComponentFilter> =
  updatedComponentFilters.slice(0, 2);

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

  it('notifies onComponentFiltersUpdated when the frontend updates component filters', () => {
    const websocket = createWebSocket();
    const onComponentFiltersUpdated = jest.fn();

    connectToDevTools({websocket, onComponentFiltersUpdated});
    websocket.onopen();
    websocket.onmessage({
      data: JSON.stringify({
        event: 'updateComponentFilters',
        payload: updatedComponentFilters,
      }),
    });

    expect(onComponentFiltersUpdated).toHaveBeenCalledTimes(1);
    expect(onComponentFiltersUpdated).toHaveBeenCalledWith(
      persistedComponentFilters,
    );
  });
});

describe('connectWithCustomMessagingProtocol', () => {
  let connectWithCustomMessagingProtocol;

  beforeEach(() => {
    jest.resetModules();
    delete window.__REACT_DEVTOOLS_GLOBAL_HOOK__;

    const backend = require('react-devtools-core/src/backend');
    backend.initialize();
    connectWithCustomMessagingProtocol =
      backend.connectWithCustomMessagingProtocol;
  });

  afterEach(() => {
    jest.clearAllTimers();
    delete window.__REACT_DEVTOOLS_GLOBAL_HOOK__;
  });

  it('notifies onComponentFiltersUpdated when the frontend updates component filters', () => {
    const listeners: Array<(message: mixed) => void> = [];
    const onComponentFiltersUpdated = jest.fn();

    const unsubscribe = connectWithCustomMessagingProtocol({
      onSubscribe: listener => {
        listeners.push(listener);
      },
      onUnsubscribe: listener => {
        listeners.splice(listeners.indexOf(listener), 1);
      },
      onMessage: () => {},
      onComponentFiltersUpdated,
    });

    try {
      listeners.forEach(listener =>
        listener({
          event: 'updateComponentFilters',
          payload: updatedComponentFilters,
        }),
      );

      expect(onComponentFiltersUpdated).toHaveBeenCalledTimes(1);
      expect(onComponentFiltersUpdated).toHaveBeenCalledWith(
        persistedComponentFilters,
      );
    } finally {
      unsubscribe();
    }
  });
});
