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

import {getVersionedRenderImplementation} from './utils';

describe('Store Suspense measurement', () => {
  let React;
  let actAsync;
  let getClientRects;

  beforeEach(() => {
    // setupTests connects a frontend before React is loaded. Disconnect it so that
    // React attaches and commits like it does on a page where DevTools isn't open.
    global.agent.shutdown();

    // JSDOM doesn't implement getClientRects so we're just faking one for testing purposes
    getClientRects = jest.fn(function (this: Element) {
      const textContent = this.textContent;
      return [
        new DOMRect(1, 2, textContent.length, textContent.split('\n').length),
      ];
    });
    Element.prototype.getClientRects = getClientRects;

    React = require('react');
    actAsync = require('./utils').actAsync;
  });

  const {render} = getVersionedRenderImplementation();

  function connectFrontend(): Store {
    const Agent = require('react-devtools-shared/src/backend/agent').default;
    const {initBackend} = require('react-devtools-shared/src/backend');
    const Bridge = require('react-devtools-shared/src/bridge').default;
    const StoreClass =
      require('react-devtools-shared/src/devtools/store').default;

    let listeners: Array<(message: any) => void> = [];
    const bridge = new Bridge({
      listen(callback) {
        listeners.push(callback);
        return () => {
          listeners = listeners.filter(listener => listener !== callback);
        };
      },
      send(event: string, payload: any) {
        listeners.forEach(callback => callback({event, payload}));
      },
    });
    const store = new StoreClass(((bridge: any): FrontendBridge));
    const agent = new Agent((bridge: any));
    initBackend(global.__REACT_DEVTOOLS_GLOBAL_HOOK__, agent, global);
    return store;
  }

  const never = new Promise(() => {});
  function Never() {
    React.use(never);
    return null;
  }
  function App({text}: {text: string}) {
    return (
      <>
        <React.Suspense name="content" fallback={null}>
          <div>{text}</div>
        </React.Suspense>
        <React.Suspense name="suspended" fallback={<div>Loading</div>}>
          <Never />
        </React.Suspense>
      </>
    );
  }

  // @reactVersion >= 19.0
  it('should measure Suspense boundaries as they commit while a frontend is connected', async () => {
    let store: Store = (null: any);
    await actAsync(() => {
      store = connectFrontend();
    });
    expect(getClientRects).not.toHaveBeenCalled();

    await actAsync(() => render(<App text="Hello" />));
    await actAsync(() => render(<App text="Hello, world" />));

    expect(getClientRects).toHaveBeenCalled();
    expect(store).toMatchInlineSnapshot(`
      [root]
        ▾ <App>
            <Suspense name="content">
            <Suspense name="suspended">
      [suspense-root]  rects={[{x:1,y:2,width:12,height:1}, {x:1,y:2,width:7,height:1}]}
        <Suspense name="content" uniqueSuspenders={false} rects={[{x:1,y:2,width:12,height:1}]}>
        <Suspense name="suspended" uniqueSuspenders={true} rects={null}>
    `);
  });

  // @reactVersion >= 19.0
  it('should not measure Suspense boundaries until a frontend connects', async () => {
    await actAsync(() => render(<App text="Hello" />));
    await actAsync(() => render(<App text="Hello, world" />));

    // Measuring forces a synchronous layout in the middle of the commit.
    expect(getClientRects).not.toHaveBeenCalled();

    let store: Store = (null: any);
    await actAsync(() => {
      store = connectFrontend();
    });

    expect(getClientRects).toHaveBeenCalled();
    expect(store).toMatchInlineSnapshot(`
      [root]
        ▾ <App>
            <Suspense name="content">
            <Suspense name="suspended">
      [suspense-root]  rects={[{x:1,y:2,width:12,height:1}, {x:1,y:2,width:7,height:1}]}
        <Suspense name="content" uniqueSuspenders={false} rects={[{x:1,y:2,width:12,height:1}]}>
        <Suspense name="suspended" uniqueSuspenders={true} rects={null}>
    `);
  });
});
