/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

describe('proxy and backend manager content scripts', () => {
  let addedListeners;
  let originalAddEventListener;
  let originalPostMessage;
  let postedMessages;

  beforeEach(() => {
    // Content scripts listen on the shared window, which outlives jest.resetModules().
    addedListeners = [];
    originalAddEventListener = window.addEventListener;
    window.addEventListener = function (type, listener, options) {
      addedListeners.push([type, listener, options]);
      return originalAddEventListener.call(this, type, listener, options);
    };

    // Both content scripts check event.source, which jsdom doesn't set.
    postedMessages = [];
    originalPostMessage = window.postMessage;
    window.postMessage = data => {
      postedMessages.push(data);
      setTimeout(() => {
        window.dispatchEvent(
          new MessageEvent('message', {data, source: window}),
        );
      }, 0);
    };

    global.chrome = {
      runtime: {
        connect: () => ({
          onMessage: {addListener() {}},
          onDisconnect: {addListener() {}},
          postMessage() {},
        }),
        onMessage: {addListener() {}},
        sendMessage: jest.fn(),
      },
    };

    // A page with a React renderer that needs a backend.
    delete window.__REACT_DEVTOOLS_GLOBAL_HOOK__;
    window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
      renderers: new Map([[1, {version: '19.0.0'}]]),
      backends: new Map(),
      sub: () => () => {},
    };
  });

  afterEach(() => {
    addedListeners.forEach(([type, listener, options]) => {
      window.removeEventListener(type, listener, options);
    });
    window.addEventListener = originalAddEventListener;
    window.postMessage = originalPostMessage;
    delete window.__REACT_DEVTOOLS_PROXY_INJECTED__;
    delete window.__REACT_DEVTOOLS_BACKEND_MANAGER_INJECTED__;
    delete global.chrome;
  });

  function injectProxy() {
    require('../contentScripts/proxy');
    window.dispatchEvent(new Event('pageshow'));
  }

  function injectBackendManager() {
    require('../contentScripts/backendManager');
  }

  function flushMessages() {
    jest.advanceTimersByTime(0);
  }

  function getHelloCount() {
    return postedMessages.filter(
      message =>
        message.source === 'react-devtools-content-script' &&
        message.hello === true,
    ).length;
  }

  function expectBackendManagerToBeWelcomed() {
    // Once welcomed, the backend manager asks for backends through the proxy.
    expect(global.chrome.runtime.sendMessage).toHaveBeenCalledWith({
      source: 'react-devtools-backend-manager',
      payload: expect.objectContaining({type: 'require-backends'}),
    });
  }

  it('should not keep saying hello when the backend manager is never injected', () => {
    injectProxy();
    jest.advanceTimersByTime(10000);

    expect(getHelloCount()).toBe(1);
  });

  it('should welcome a backend manager injected after the proxy', () => {
    injectProxy();
    flushMessages();
    expect(getHelloCount()).toBe(1);

    injectBackendManager();
    flushMessages();

    expectBackendManagerToBeWelcomed();
    expect(getHelloCount()).toBe(2);
  });

  it('should welcome a backend manager injected before the proxy', () => {
    injectBackendManager();
    flushMessages();
    expect(global.chrome.runtime.sendMessage).not.toHaveBeenCalled();

    injectProxy();
    flushMessages();

    expectBackendManagerToBeWelcomed();
    expect(getHelloCount()).toBe(1);
  });
});
