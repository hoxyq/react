import {PANEL_HOSTS_DEVTOOLS_SEARCH_PARAM} from './constants';

// Portal target container.
window.container = document.getElementById('container');

let hasInjectedStyles = false;

// DevTools styles are injected into the top-level document head (where the main React app is rendered).
// This method copies those styles to the child window where each panel (e.g. Elements, Profiler) is portaled.
window.injectStyles = getLinkTags => {
  if (!hasInjectedStyles) {
    hasInjectedStyles = true;

    const linkTags = getLinkTags();

    // eslint-disable-next-line no-for-of-loops/no-for-of-loops
    for (const linkTag of linkTags) {
      document.head.appendChild(linkTag);
    }
  }
};

// The devtools page can't render into this panel, so the panel loads DevTools itself.
// See createPanelHostingDevTools() in main/index.js.
if (
  new URLSearchParams(window.location.search).has(
    PANEL_HOSTS_DEVTOOLS_SEARCH_PARAM,
  )
) {
  const script = document.createElement('script');
  script.src = './build/main.js';
  document.body.appendChild(script);
}
