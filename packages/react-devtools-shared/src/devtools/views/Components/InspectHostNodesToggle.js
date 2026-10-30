/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import * as React from 'react';
import {
  useCallback,
  useContext,
  useEffect,
  useEffectEvent,
  useState,
} from 'react';
import {BridgeContext} from '../context';
import Toggle from '../Toggle';
import ButtonIcon from '../ButtonIcon';
import {logEvent} from 'react-devtools-shared/src/Logger';

export default function InspectHostNodesToggle({
  containerRef,
  onlySuspenseNodes,
}: {
  // An element of the tab this toggle is rendered in.
  // Used to scope the keyboard shortcut to that tab.
  containerRef: {+current: HTMLElement | null},
  onlySuspenseNodes?: boolean,
}): React.Node {
  const [isInspecting, setIsInspecting] = useState(false);
  const bridge = useContext(BridgeContext);

  const isMac =
    typeof navigator !== 'undefined' &&
    navigator.platform.toUpperCase().indexOf('MAC') >= 0;

  const handleChange = useCallback(
    (isChecked: boolean) => {
      setIsInspecting(isChecked);

      if (isChecked) {
        logEvent({event_name: 'inspect-element-button-clicked'});
        bridge.send('startInspectingHost', !!onlySuspenseNodes);
      } else {
        bridge.send('stopInspectingHost');
      }
    },
    [bridge],
  );

  useEffect(() => {
    const onStopInspectingHost = () => setIsInspecting(false);
    bridge.addListener('stopInspectingHost', onStopInspectingHost);
    return () =>
      bridge.removeListener('stopInspectingHost', onStopInspectingHost);
  }, [bridge]);

  const handleKeyDown = useEffectEvent((event: KeyboardEvent) => {
    const container = containerRef.current;
    // When DevTools renders its own tab bar, all tabs stay mounted in the same
    // window, so only the toggle of the visible tab should respond.
    if (container === null || container.closest('[hidden]') !== null) {
      return;
    }

    const correctModifier = isMac ? event.metaKey : event.ctrlKey;
    // Cmd+Shift+C (Mac) or Ctrl+Shift+C (Windows/Linux) to toggle inspecting,
    // same as the browser's own element picker.
    if (
      correctModifier &&
      event.shiftKey &&
      !event.altKey &&
      event.key.toLowerCase() === 'c'
    ) {
      handleChange(!isInspecting);
      event.preventDefault();
      event.stopPropagation();
    }
  });

  useEffect(() => {
    const container = containerRef.current;
    if (container === null) {
      return;
    }
    const ownerWindow = container.ownerDocument.defaultView;
    // Capture phase: Cmd/Ctrl+Shift+C is the browser DevTools' own shortcut,
    // so we must intercept it before it is forwarded to the browser.
    ownerWindow.addEventListener('keydown', handleKeyDown, true);
    return () => {
      ownerWindow.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [containerRef]);

  const shortcut = isMac ? '⇧⌘C' : 'Ctrl+Shift+C';

  return (
    <Toggle
      onChange={handleChange}
      isChecked={isInspecting}
      title={`Select an element in the page to inspect it - ${shortcut}`}>
      <ButtonIcon type="search" />
    </Toggle>
  );
}
