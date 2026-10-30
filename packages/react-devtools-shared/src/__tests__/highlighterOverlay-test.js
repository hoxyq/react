/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

describe('Highlighter Overlay', () => {
  let Overlay;
  let agent;
  let topLayer;

  function mockPopoverAPI() {
    // JSDOM doesn't implement the Popover API, so emulate the top layer.
    topLayer = [];
    HTMLElement.prototype.showPopover = function () {
      topLayer.push(this);
    };
    HTMLElement.prototype.hidePopover = function () {
      topLayer.splice(topLayer.indexOf(this), 1);
    };
    const originalMatches = Element.prototype.matches;
    jest
      .spyOn(Element.prototype, 'matches')
      .mockImplementation(function (selector) {
        if (selector === ':popover-open') {
          return topLayer.includes(this);
        }
        return originalMatches.call(this, selector);
      });
  }

  beforeEach(() => {
    Overlay =
      require('react-devtools-shared/src/backend/views/Highlighter/Overlay').default;
    agent = {getComponentNameForHostInstance: () => null};
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete HTMLElement.prototype.showPopover;
    delete HTMLElement.prototype.hidePopover;
    document.body.innerHTML = '';
  });

  it('should render the overlay in the top layer', () => {
    mockPopoverAPI();

    const target = document.createElement('div');
    document.body.appendChild(target);

    const overlay = new Overlay(agent);
    overlay.inspect([target], 'Target');

    expect(overlay.container.getAttribute('popover')).toBe('manual');
    expect(overlay.container.style.pointerEvents).toBe('none');
    expect(topLayer).toEqual([overlay.container]);
  });

  it('should stay above top layer elements shown after the overlay', () => {
    mockPopoverAPI();

    const target = document.createElement('div');
    document.body.appendChild(target);

    const overlay = new Overlay(agent);
    overlay.inspect([target], 'Target');

    // E.g. a modal <dialog> opened while the overlay is visible.
    const dialog = document.createElement('div');
    document.body.appendChild(dialog);
    dialog.showPopover();
    expect(topLayer).toEqual([overlay.container, dialog]);

    overlay.inspect([target], 'Target');
    expect(topLayer).toEqual([dialog, overlay.container]);
  });

  it('should fall back to z-index without the Popover API', () => {
    const target = document.createElement('div');
    document.body.appendChild(target);

    const overlay = new Overlay(agent);
    overlay.inspect([target], 'Target');

    expect(overlay.container.hasAttribute('popover')).toBe(false);
    expect(overlay.container.style.zIndex).toBe('10000000');
    expect(overlay.container.parentNode).toBe(document.body);
  });
});
