/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import {readFileSync} from 'fs';
import path from 'path';

const pathToExtensionsPackage = path.resolve(__dirname, '..', '..');

function getContentScripts(browser: string): Array<{
  file: string,
  matches: Array<string>,
  runAt: string,
  world: string,
}> {
  const manifest = JSON.parse(
    readFileSync(
      path.join(pathToExtensionsPackage, browser, 'manifest.json'),
    ).toString(),
  );

  return manifest.content_scripts.flatMap(
    ({js, matches, run_at: runAt, world = 'ISOLATED'}) =>
      js.map(file => ({file, matches, runAt, world})),
  );
}

describe('extension manifest', () => {
  // Content scripts have to be declared statically, so that the browser injects them
  // as soon as the extension is loaded. If they are registered by the service worker,
  // pages that are loaded before it has started won't have the hook installed.
  it('should declare content scripts statically for Chrome', () => {
    expect(getContentScripts('chrome')).toEqual([
      {
        file: 'build/prepareInjection.js',
        matches: ['<all_urls>'],
        runAt: 'document_start',
        world: 'ISOLATED',
      },
      {
        file: 'build/proxy.js',
        matches: ['<all_urls>'],
        runAt: 'document_start',
        world: 'ISOLATED',
      },
      {
        file: 'build/fileFetcher.js',
        matches: ['<all_urls>'],
        runAt: 'document_end',
        world: 'ISOLATED',
      },
      {
        file: 'build/fallbackEvalContext.js',
        matches: ['<all_urls>'],
        runAt: 'document_start',
        world: 'MAIN',
      },
      {
        file: 'build/installHook.js',
        matches: ['<all_urls>'],
        runAt: 'document_start',
        world: 'MAIN',
      },
      {
        file: 'build/hookSettingsInjector.js',
        matches: ['<all_urls>'],
        runAt: 'document_start',
        world: 'ISOLATED',
      },
    ]);
  });

  it('should declare the same content scripts for Edge and Firefox', () => {
    const chromeContentScripts = getContentScripts('chrome');

    expect(getContentScripts('edge')).toEqual(chromeContentScripts);
    expect(getContentScripts('firefox')).toEqual(chromeContentScripts);
  });
});
