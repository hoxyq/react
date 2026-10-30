/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

describe('Open in editor', () => {
  let React;
  let ReactDOMClient;
  let utils;

  let ComponentsOpenInEditorButton;
  let EditorOpenInEditorButton;
  let SettingsContext;
  let ViewElementSourceContext;
  let useOpenResource;
  let localStorageRemoveItem;
  let localStorageSetItem;
  let LOCAL_STORAGE_ALWAYS_OPEN_IN_EDITOR;

  let container;
  let root;
  let openInEditorFunction;
  let windowOpen;

  // The default editor URL is vscode://file/{path}:{line}:{column}
  const expectedURL = 'vscode://file//path/to/App.js:10:5';

  beforeEach(() => {
    utils = require('./utils');

    React = require('react');
    ReactDOMClient = require('react-dom/client');

    ComponentsOpenInEditorButton =
      require('react-devtools-shared/src/devtools/views/Components/OpenInEditorButton').default;
    EditorOpenInEditorButton =
      require('react-devtools-shared/src/devtools/views/Editor/OpenInEditorButton').default;
    SettingsContext =
      require('react-devtools-shared/src/devtools/views/Settings/SettingsContext').SettingsContext;
    ViewElementSourceContext =
      require('react-devtools-shared/src/devtools/views/Components/ViewElementSourceContext').default;
    useOpenResource =
      require('react-devtools-shared/src/devtools/views/useOpenResource').default;
    localStorageRemoveItem =
      require('react-devtools-shared/src/storage').localStorageRemoveItem;
    localStorageSetItem =
      require('react-devtools-shared/src/storage').localStorageSetItem;
    LOCAL_STORAGE_ALWAYS_OPEN_IN_EDITOR =
      require('react-devtools-shared/src/constants').LOCAL_STORAGE_ALWAYS_OPEN_IN_EDITOR;

    // Tooltip warns in DEV if its styles are not loaded, which they aren't in tests.
    document.body.style.setProperty('--reach-tooltip', '1');

    container = document.createElement('div');
    document.body.appendChild(container);
    root = ReactDOMClient.createRoot(container);

    openInEditorFunction = jest.fn();
    windowOpen = jest.spyOn(window, 'open').mockImplementation(() => null);
  });

  afterEach(() => {
    utils.act(() => root.unmount());
    document.body.removeChild(container);
    document.body.style.removeProperty('--reach-tooltip');
    localStorageRemoveItem(LOCAL_STORAGE_ALWAYS_OPEN_IN_EDITOR);
    windowOpen.mockRestore();
  });

  // Hosts like the Firefox extension can't use window.open(),
  // so every "open in editor" action has to go through the function the host provided.
  async function renderAndClick(children) {
    await utils.actAsync(() =>
      root.render(
        <SettingsContext.Provider
          value={{
            browserTheme: 'light',
            displayDensity: 'compact',
            theme: 'light',
          }}>
          <ViewElementSourceContext.Provider
            value={{
              canViewElementSourceFunction: null,
              openInEditorFunction,
              viewElementSourceFunction: null,
            }}>
            {children}
          </ViewElementSourceContext.Provider>
        </SettingsContext.Provider>,
      ),
    );

    const button = container.querySelector('button');
    expect(button).not.toBe(null);
    expect(button.disabled).toBe(false);

    utils.act(() => button.click());
  }

  it('should use openInEditorFunction for the inspected element button', async () => {
    await renderAndClick(
      <ComponentsOpenInEditorButton
        editorURL="vscode://file/{path}:{line}:{column}"
        source={['App', '/path/to/App.js', 10, 5]}
        symbolicatedSourcePromise={Promise.resolve(null)}
      />,
    );

    expect(openInEditorFunction).toHaveBeenCalledTimes(1);
    expect(openInEditorFunction).toHaveBeenCalledWith(expectedURL);
    expect(windowOpen).not.toHaveBeenCalled();
  });

  it('should use openInEditorFunction for the editor pane button', async () => {
    await renderAndClick(
      <EditorOpenInEditorButton
        editorURL="vscode://file/{path}:{line}:{column}"
        source={{url: '/path/to/App.js', selectionRef: {line: 10, column: 5}}}
      />,
    );

    expect(openInEditorFunction).toHaveBeenCalledTimes(1);
    expect(openInEditorFunction).toHaveBeenCalledWith(expectedURL);
    expect(windowOpen).not.toHaveBeenCalled();
  });

  it('should use openInEditorFunction for source links when always opening in editor', async () => {
    localStorageSetItem(LOCAL_STORAGE_ALWAYS_OPEN_IN_EDITOR, 'true');

    function SourceLink() {
      const [linkIsEnabled, viewSource] = useOpenResource(
        ['App', '/path/to/App.js', 10, 5],
        null,
      );
      return (
        <button disabled={!linkIsEnabled} onClick={viewSource}>
          App.js
        </button>
      );
    }

    await renderAndClick(<SourceLink />);

    expect(openInEditorFunction).toHaveBeenCalledTimes(1);
    expect(openInEditorFunction).toHaveBeenCalledWith(expectedURL);
    expect(windowOpen).not.toHaveBeenCalled();
  });
});
