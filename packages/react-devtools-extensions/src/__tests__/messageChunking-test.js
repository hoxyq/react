/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import {
  createChunkedMessageListener,
  splitMessageIntoChunks,
} from '../messageChunking';
import {EXTENSION_BRIDGE_CONNECTION_READY} from '../constants';

describe('message chunking', () => {
  function sendThroughChunks(message: mixed, maxChunkLength: number) {
    const received = [];
    const listener = createChunkedMessageListener(receivedMessage =>
      received.push(receivedMessage),
    );
    const chunks = splitMessageIntoChunks(message, maxChunkLength);
    if (chunks === null) {
      throw new Error('Expected the message to be split into chunks.');
    }
    chunks.forEach(listener);
    return {chunks, received};
  }

  it('should not split short messages', () => {
    expect(
      splitMessageIntoChunks({event: 'operations', payload: [1, 2]}, 100),
    ).toBe(null);
  });

  it('should join chunks back into the original message', () => {
    const message = {
      event: 'profilingData',
      payload: {
        dataForRoots: [{rootID: 1, commitData: [{duration: 1.5}]}],
        rendererID: 1,
      },
    };

    const {chunks, received} = sendThroughChunks(message, 10);
    expect(chunks.length).toBeGreaterThan(1);
    chunks.forEach(chunk => {
      expect(chunk.data.length).toBeLessThanOrEqual(10);
    });
    expect(received).toEqual([message]);
  });

  it('should not split surrogate pairs between chunks', () => {
    const message = {event: 'saveToClipboard', payload: '😀😀😀😀😀😀😀😀'};

    // An odd chunk length would split every other emoji.
    const {chunks, received} = sendThroughChunks(message, 5);
    chunks.forEach(chunk => {
      expect(chunk.data).not.toMatch(/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/);
    });
    expect(received).toEqual([message]);
  });

  it('should pass other messages through', () => {
    const received = [];
    const listener = createChunkedMessageListener(message =>
      received.push(message),
    );

    const chunks = splitMessageIntoChunks({event: 'big', payload: 'abcd'}, 4);
    if (chunks === null) {
      throw new Error('Expected the message to be split into chunks.');
    }
    listener(chunks[0]);
    listener({event: 'resumeElementPolling'});
    chunks.slice(1).forEach(listener);

    expect(received).toEqual([
      {event: 'resumeElementPolling'},
      {event: 'big', payload: 'abcd'},
    ]);
  });

  it('should drop a partially sent message once it is sent again', () => {
    const received = [];
    const listener = createChunkedMessageListener(message =>
      received.push(message),
    );

    const message = {event: 'big', payload: 'abcdefghijklmnopqrstuvwxyz'};
    const chunks = splitMessageIntoChunks(message, 8);
    if (chunks === null) {
      throw new Error('Expected the message to be split into chunks.');
    }
    // The port disconnects after the first two chunks, and the proxy sends the
    // whole message again once it is reconnected.
    chunks.slice(0, 2).forEach(listener);
    chunks.forEach(listener);

    expect(received).toEqual([message]);
  });
});

describe('proxy content script', () => {
  // Chrome's limit for the UTF-8 encoded JSON of a single message.
  const CHROME_MAX_MESSAGE_LENGTH = 64 * 1024 * 1024;

  let port;
  let receivedByDevTools;

  beforeEach(() => {
    jest.resetModules();

    receivedByDevTools = [];
    const forwardToDevTools = createChunkedMessageListener(message =>
      receivedByDevTools.push(message),
    );
    const messageListeners = [];
    port = {
      name: 'proxy',
      disconnect: jest.fn(),
      onMessage: {
        addListener: listener => messageListeners.push(listener),
        removeListener: jest.fn(),
      },
      onDisconnect: {
        addListener: jest.fn(),
        removeListener: jest.fn(),
      },
      postMessage: jest.fn(message => {
        // All messages in this test are ASCII, so the length of their JSON is
        // the same as the length of its UTF-8 encoding.
        if (JSON.stringify(message).length > CHROME_MAX_MESSAGE_LENGTH) {
          throw new Error('Message length exceeded maximum allowed length.');
        }
        forwardToDevTools(message);
      }),
      receiveMessageFromBackground: message =>
        messageListeners.forEach(listener => listener(message)),
    };
    global.chrome = {
      runtime: {
        connect: jest.fn(() => port),
        onMessage: {addListener: jest.fn()},
        sendMessage: jest.fn(),
      },
    };

    require('../contentScripts/proxy');
    window.dispatchEvent(new Event('pageshow'));
    port.receiveMessageFromBackground({
      source: 'react-devtools-background',
      payload: {type: EXTENSION_BRIDGE_CONNECTION_READY},
    });
    receivedByDevTools.length = 0;
  });

  afterEach(() => {
    document.dispatchEvent(new Event('pagehide', {bubbles: true}));
    delete global.chrome;
  });

  function sendMessageFromBackend(message: mixed) {
    window.dispatchEvent(
      new MessageEvent('message', {
        source: window,
        data: {source: 'react-devtools-bridge', payload: message},
      }),
    );
  }

  it('should send messages that are too long for Chrome in chunks', () => {
    const profilingData = {
      event: 'profilingData',
      payload: {
        dataForRoots: [
          {
            rootID: 1,
            displayName: 'x'.repeat(CHROME_MAX_MESSAGE_LENGTH),
            commitData: [],
          },
        ],
        rendererID: 1,
      },
    };

    sendMessageFromBackend(profilingData);
    sendMessageFromBackend({event: 'profilingStatus', payload: false});

    expect(receivedByDevTools.map(message => message.event)).toEqual([
      'profilingData',
      'profilingStatus',
    ]);
    // Compare serialized messages so that a mismatch doesn't print 64 MiB.
    expect(
      JSON.stringify(receivedByDevTools[0]) === JSON.stringify(profilingData),
    ).toBe(true);
  });
});
