/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import * as React from 'react';

import styles from './Profiler.css';

export default function ProfilingNotSupported(): React.Node {
  return (
    <div className={styles.Column}>
      <div className={styles.Header}>Profiling not supported.</div>
      <p className={styles.Paragraph}>
        Profiling support requires either a development or profiling build of
        React v16.5+.
      </p>
      <p className={styles.Paragraph}>
        Learn more about{' '}
        <a
          className={styles.Link}
          href="https://react.dev/reference/dev-tools/react-performance-tracks#using-profiling-builds"
          rel="noopener noreferrer"
          target="_blank">
          profiling builds
        </a>
        .
      </p>
    </div>
  );
}
