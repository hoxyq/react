/* global chrome */

// Content scripts are declared statically in manifest.json, so the browser injects them
// as soon as the extension is loaded. They used to be registered from here with
// `chrome.scripting.registerContentScripts`, which only happens after the service worker
// has started: pages loaded before that never got the hook and React wasn't detected,
// for example in the first window of an Electron app.
//
// Older versions registered them with `persistAcrossSessions`. Remove any leftovers,
// in case the host kept them, so that the same content scripts are not injected twice.
async function unregisterDynamicContentScripts() {
  try {
    await chrome.scripting.unregisterContentScripts();
  } catch (error) {
    console.error(error);
  }
}

unregisterDynamicContentScripts();
