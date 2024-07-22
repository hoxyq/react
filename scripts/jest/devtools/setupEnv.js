'use strict';

const semver = require('semver');
const {ReactVersion} = require('../../../ReactVersions');
const {getTestFlags} = require('../TestFlags');

// DevTools stores preferences between sessions in localStorage
if (!global.hasOwnProperty('localStorage')) {
  global.localStorage = require('local-storage-fallback').default;
}

// Mimic the global we set with Webpack's DefinePlugin
global.__DEV__ = process.env.NODE_ENV !== 'production';
global.__TEST__ = true;
global.__IS_FIREFOX__ = false;
global.__IS_CHROME__ = false;
global.__IS_EDGE__ = false;

const ReactVersionTestingAgainst = process.env.REACT_VERSION || ReactVersion;

global._test_react_version = (range, testName, callback) => {
  const shouldPass = semver.satisfies(ReactVersionTestingAgainst, range);

  if (shouldPass) {
    test(testName, callback);
  } else {
    test.skip(testName, callback);
  }
};

global._test_react_version_focus = (range, testName, callback) => {
  const shouldPass = semver.satisfies(ReactVersionTestingAgainst, range);

  if (shouldPass) {
    test.only(testName, callback);
  } else {
    test.skip(testName, callback);
  }
};

global._test_ignore_for_react_version = (testName, callback) => {
  test.skip(testName, callback);
};

global._test_react_version_with_gate = (range, gateFn, testName, callback) => {
  const shouldPass = semver.satisfies(ReactVersionTestingAgainst, range);

  if (shouldPass) {
    global._test_gate(gateFn, testName, callback);
  } else {
    test.skip(testName, callback);
  }
};

global._test_react_version_with_gate_focus = (
  range,
  gateFn,
  testName,
  callback
) => {
  const shouldPass = semver.satisfies(ReactVersionTestingAgainst, range);

  if (shouldPass) {
    global._test_gate_focus(gateFn, testName, callback);
  } else {
    test.skip(testName, callback);
  }
};

global._test_ignore_for_react_version_with_gate = (
  gateFn,
  testName,
  callback
) => {
  test.skip(testName, callback);
};

// Most of our tests call jest.resetModules in a beforeEach and the
// re-require all the React modules. However, the JSX runtime is injected by
// the compiler, so those bindings don't get updated. This causes warnings
// logged by the JSX runtime to not have a component stack, because component
// stack relies on the the secret internals object that lives on the React
// module, which because of the resetModules call is longer the same one.
//
// To workaround this issue, we use a proxy that re-requires the latest
// JSX Runtime from the require cache on every function invocation.
//
// Longer term we should migrate all our tests away from using require() and
// resetModules, and use import syntax instead so this kind of thing doesn't
// happen.
if (semver.gte(ReactVersionTestingAgainst, '17.0.0')) {
  lazyRequireFunctionExports('react/jsx-dev-runtime');

  // TODO: We shouldn't need to do this in the production runtime, but until
  // we remove string refs they also depend on the shared state object. Remove
  // once we remove string refs.
  lazyRequireFunctionExports('react/jsx-runtime');
}

function lazyRequireFunctionExports(moduleName) {
  jest.mock(moduleName, () => {
    return new Proxy(jest.requireActual(moduleName), {
      get(originalModule, prop) {
        // If this export is a function, return a wrapper function that lazily
        // requires the implementation from the current module cache.
        if (typeof originalModule[prop] === 'function') {
          return function () {
            return jest.requireActual(moduleName)[prop].apply(this, arguments);
          };
        } else {
          return originalModule[prop];
        }
      },
    });
  });
}

const expectTestToFail = async (callback, error) => {
  if (callback.length > 0) {
    throw Error(
      'Gated test helpers do not support the `done` callback. Return a ' +
        'promise instead.'
    );
  }
  try {
    const maybePromise = callback();
    if (
      maybePromise !== undefined &&
      maybePromise !== null &&
      typeof maybePromise.then === 'function'
    ) {
      await maybePromise;
    }
  } catch (testError) {
    return;
  }
  throw error;
};

const gatedErrorMessage = 'Gated test was expected to fail, but it passed.';
global._test_gate = (gateFn, testName, callback) => {
  let shouldPass;
  try {
    const flags = getTestFlags();
    shouldPass = gateFn(flags);
  } catch (e) {
    test(testName, () => {
      throw e;
    });
    return;
  }
  if (shouldPass) {
    test(testName, callback);
  } else {
    const error = new Error(gatedErrorMessage);
    Error.captureStackTrace(error, global._test_gate);
    test(`[GATED, SHOULD FAIL] ${testName}`, () =>
      expectTestToFail(callback, error));
  }
};
global._test_gate_focus = (gateFn, testName, callback) => {
  let shouldPass;
  try {
    const flags = getTestFlags();
    shouldPass = gateFn(flags);
  } catch (e) {
    test.only(testName, () => {
      throw e;
    });
    return;
  }
  if (shouldPass) {
    test.only(testName, callback);
  } else {
    const error = new Error(gatedErrorMessage);
    Error.captureStackTrace(error, global._test_gate_focus);
    test.only(`[GATED, SHOULD FAIL] ${testName}`, () =>
      expectTestToFail(callback, error));
  }
};

// Dynamic version of @gate pragma
global.gate = fn => {
  const flags = getTestFlags();
  return fn(flags);
};
