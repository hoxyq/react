#!/usr/bin/env node

/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

const electron = require('electron');
const spawn = require('cross-spawn');
const argv = process.argv.slice(2);
const pkg = require('./package.json');
const updateNotifier = require('update-notifier');

// Notify if there's an update in 7 days' interval
const notifier = updateNotifier({
  pkg,
  updateCheckInterval: 1000 * 60 * 60 * 24 * 7,
});

if (notifier.update) {
  const updateMsg =
    `Update available ${notifier.update.current} -> ${notifier.update.latest}` +
    '\nTo update:' +
    '\n"npm i [-g] react-devtools" or "yarn add react-devtools"';
  notifier.notify({defer: false, message: updateMsg});
}

const result = spawn.sync(electron, [require.resolve('./app')].concat(argv), {
  // Forward Electron's output, so that startup failures aren't silent.
  stdio: ['ignore', 'inherit', 'inherit'],
});

if (result.error) {
  console.error(`Failed to start Electron: ${result.error.message}`);
  process.exit(1);
}

if (result.status !== 0) {
  if (result.signal) {
    console.error(`Electron exited with signal ${result.signal}.`);
  }

  // Chromium aborts on startup if it can't set up its sandbox, for example
  // when AppArmor restricts unprivileged user namespaces (Ubuntu 24.04+).
  if (process.platform === 'linux' && !argv.includes('--no-sandbox')) {
    console.error(
      '\nIf the error above mentions the sandbox, try running ' +
        '"react-devtools --no-sandbox". For more details, see ' +
        'https://github.com/react/react/tree/main/packages/react-devtools#the-app-doesnt-start-on-linux',
    );
  }
}

process.exit(result.status === null ? 1 : result.status);
