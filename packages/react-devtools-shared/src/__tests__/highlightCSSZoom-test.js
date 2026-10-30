/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

// jsdom doesn't implement CSS zoom, so these tests mock what browsers with
// standardized CSS zoom report: an accumulated `currentCSSZoom`, zoomed
// getBoundingClientRect() values and unzoomed getComputedStyle() lengths.
describe('highlighting with CSS zoom', () => {
  let getEffectiveZoom;
  let getElementDimensions;

  function setCurrentCSSZoom(node: Element, zoom: number) {
    Object.defineProperty(node, 'currentCSSZoom', {
      configurable: true,
      value: zoom,
    });
  }

  function createElement(
    rect: {top: number, left: number, width: number, height: number},
    zoom: number,
  ): HTMLElement {
    const element = document.createElement('div');
    element.style.margin = '10px';
    element.style.borderWidth = '4px';
    element.style.borderStyle = 'solid';
    element.style.padding = '6px';
    setCurrentCSSZoom(element, zoom);
    element.getBoundingClientRect = () =>
      ({
        ...rect,
        right: rect.left + rect.width,
        bottom: rect.top + rect.height,
      }) as any;
    return element;
  }

  beforeEach(() => {
    jest.resetModules();
    const utils = require('react-devtools-shared/src/backend/views/utils');
    getEffectiveZoom = utils.getEffectiveZoom;
    getElementDimensions = utils.getElementDimensions;

    // jsdom drops the zoom property, so keep it around for assertions.
    const setProperty = CSSStyleDeclaration.prototype.setProperty;
    jest
      .spyOn(CSSStyleDeclaration.prototype, 'setProperty')
      .mockImplementation(function (name, value, priority) {
        if (name === 'zoom') {
          this.zoom = value;
        } else {
          setProperty.call(this, name, value, priority);
        }
      });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete document.documentElement.currentCSSZoom;
    delete document.body.currentCSSZoom;
    document.body.innerHTML = '';
  });

  describe('getEffectiveZoom', () => {
    it('should return 1 when the browser does not report currentCSSZoom', () => {
      expect(getEffectiveZoom(document.createElement('div'))).toBe(1);
    });

    it('should return currentCSSZoom when the browser reports it', () => {
      const element = document.createElement('div');
      setCurrentCSSZoom(element, 0.5);
      expect(getEffectiveZoom(element)).toBe(0.5);
    });
  });

  describe('getElementDimensions', () => {
    it('should scale computed lengths by the zoom of the element', () => {
      const element = createElement(
        {top: 0, left: 0, width: 0, height: 0},
        0.5,
      );
      document.body.appendChild(element);

      expect(getElementDimensions(element)).toEqual({
        borderBottom: 2,
        borderLeft: 2,
        borderRight: 2,
        borderTop: 2,
        marginBottom: 5,
        marginLeft: 5,
        marginRight: 5,
        marginTop: 5,
        paddingBottom: 3,
        paddingLeft: 3,
        paddingRight: 3,
        paddingTop: 3,
      });
    });
  });

  describe('Overlay', () => {
    let Overlay;

    beforeEach(() => {
      Overlay =
        require('react-devtools-shared/src/backend/views/Highlighter/Overlay').default;
    });

    function inspect(element: HTMLElement) {
      const overlay = new Overlay(({}: any));
      overlay.inspect([element], 'div');
      const node = overlay.rects[0].node;
      return {overlay, node, content: node.firstChild.firstChild.firstChild};
    }

    it('should cancel out the zoom it inherits from the page', () => {
      // html { zoom: 0.5 }
      setCurrentCSSZoom(document.documentElement, 0.5);
      setCurrentCSSZoom(document.body, 0.5);
      // Laid out at (20, 500) with a 100x50 content box, rendered at half size.
      const element = createElement(
        {top: 250, left: 10, width: 60, height: 35},
        0.5,
      );
      document.body.appendChild(element);

      const {overlay, node, content} = inspect(element);

      expect(overlay.container.style.zoom).toBe('2');
      expect(node.style.top).toBe('245px');
      expect(node.style.left).toBe('5px');
      expect(node.style.borderTopWidth).toBe('5px');
      expect(content.style.width).toBe('50px');
      expect(content.style.height).toBe('25px');

      overlay.remove();
    });

    it('should only scale the box model of an element inside a zoomed subtree', () => {
      // <div style="zoom: 2"> around the element, the page itself is not zoomed.
      const element = createElement(
        {top: 1000, left: 40, width: 240, height: 140},
        2,
      );
      document.body.appendChild(element);

      const {overlay, node, content} = inspect(element);

      expect(overlay.container.style.zoom).toBe('');
      expect(node.style.top).toBe('980px');
      expect(node.style.left).toBe('20px');
      expect(node.style.borderTopWidth).toBe('20px');
      expect(content.style.width).toBe('200px');
      expect(content.style.height).toBe('100px');

      overlay.remove();
    });
  });

  describe('TraceUpdates canvas', () => {
    let draw;
    let destroy;

    beforeEach(() => {
      const canvasModule = require('react-devtools-shared/src/backend/views/TraceUpdates/canvas');
      draw = canvasModule.draw;
      destroy = canvasModule.destroy;

      const context = {
        beginPath() {},
        clearRect() {},
        fillRect() {},
        fillText() {},
        measureText: () => ({width: 0}),
        rect() {},
        scale() {},
        stroke() {},
      };
      // jsdom implements neither canvas nor the Popover API.
      jest
        .spyOn(HTMLCanvasElement.prototype, 'getContext')
        .mockImplementation(() => context);
      HTMLCanvasElement.prototype.matches = () => false;
      HTMLCanvasElement.prototype.showPopover = () => {};
      HTMLCanvasElement.prototype.hidePopover = () => {};
    });

    afterEach(() => {
      destroy(({}: any));
      delete HTMLCanvasElement.prototype.matches;
      delete HTMLCanvasElement.prototype.showPopover;
      delete HTMLCanvasElement.prototype.hidePopover;
    });

    function drawOneNode(): HTMLCanvasElement {
      const nodeToData = new Map([
        [
          document.body,
          {
            count: 1,
            displayName: 'App',
            expirationTime: 0,
            lastMeasuredAt: 0,
            rect: {top: 10, left: 10, width: 10, height: 10},
          },
        ],
      ]);
      draw((nodeToData: any), ({}: any));
      return (document.querySelector('canvas'): any);
    }

    it('should cancel out the zoom it inherits from the page', () => {
      // html { zoom: 0.5 }
      setCurrentCSSZoom(document.documentElement, 0.5);

      const canvas = drawOneNode();

      expect(canvas.style.zoom).toBe('2');
      expect(canvas.style.width).toBe(`${window.innerWidth}px`);
      expect(canvas.style.height).toBe(`${window.innerHeight}px`);
    });

    it('should not set zoom when the page is not zoomed', () => {
      const canvas = drawOneNode();

      expect(canvas.style.zoom).toBe('');
    });
  });
});
