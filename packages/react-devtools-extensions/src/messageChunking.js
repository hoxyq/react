/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

// Chrome throws when a message sent through an extension port takes more than
// 64 MiB once serialized. The profiling data of a long session in a large app
// can be larger than that, so such messages are sent in chunks instead.
//
// A chunk holds at most this many UTF-16 code units of the message serialized
// as JSON. Each one takes at most 3 bytes in UTF-8, also when the chunk itself
// is serialized, which keeps every chunk well below the limit.
const MAX_MESSAGE_CHUNK_LENGTH = 8 * 1024 * 1024;

type MessageChunkSource = 'react-devtools-message-chunk';

const MESSAGE_CHUNK_SOURCE: MessageChunkSource = 'react-devtools-message-chunk';

export type MessageChunk = {
  source: MessageChunkSource,
  index: number,
  count: number,
  data: string,
};

// Returns null if the serialized message fits into a single chunk.
export function splitMessageIntoChunks(
  message: mixed,
  maxChunkLength: number = MAX_MESSAGE_CHUNK_LENGTH,
): Array<MessageChunk> | null {
  const serializedMessage = JSON.stringify(message);
  if (
    serializedMessage === undefined ||
    serializedMessage.length <= maxChunkLength
  ) {
    return null;
  }

  const data: Array<string> = [];
  let start = 0;
  while (start < serializedMessage.length) {
    let end = Math.min(start + maxChunkLength, serializedMessage.length);
    // Don't split a surrogate pair between two chunks.
    if (
      end < serializedMessage.length &&
      end - start > 1 &&
      isHighSurrogate(serializedMessage.charCodeAt(end - 1))
    ) {
      end--;
    }
    data.push(serializedMessage.slice(start, end));
    start = end;
  }

  return data.map((chunk, index) => ({
    source: MESSAGE_CHUNK_SOURCE,
    index,
    count: data.length,
    data: chunk,
  }));
}

// Wraps a port message listener, so that it receives chunked messages
// once all of their chunks have arrived, joined back into the original message.
export function createChunkedMessageListener(
  listener: (message: mixed) => void,
): (message: mixed) => void {
  let receivedChunks: Array<string> = [];

  return (message: mixed) => {
    const chunk = getMessageChunk(message);
    if (chunk === null) {
      listener(message);
      return;
    }

    if (chunk.index !== receivedChunks.length) {
      // The previous message was only partially sent, e.g. because the port
      // was disconnected while sending it. It will be sent again from the start.
      receivedChunks = [];
      if (chunk.index !== 0) {
        return;
      }
    }

    receivedChunks.push(chunk.data);
    if (receivedChunks.length === chunk.count) {
      const serializedMessage = receivedChunks.join('');
      receivedChunks = [];
      listener(JSON.parse(serializedMessage));
    }
  };
}

function getMessageChunk(message: mixed): MessageChunk | null {
  if (
    message === null ||
    typeof message !== 'object' ||
    !('source' in message) ||
    message.source !== MESSAGE_CHUNK_SOURCE ||
    !('index' in message) ||
    typeof message.index !== 'number' ||
    !('count' in message) ||
    typeof message.count !== 'number' ||
    !('data' in message) ||
    typeof message.data !== 'string'
  ) {
    return null;
  }

  return {
    source: MESSAGE_CHUNK_SOURCE,
    index: message.index,
    count: message.count,
    data: message.data,
  };
}

function isHighSurrogate(charCode: number): boolean {
  return charCode >= 0xd800 && charCode <= 0xdbff;
}
