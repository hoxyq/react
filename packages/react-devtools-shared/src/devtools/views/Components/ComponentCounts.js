/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import * as React from 'react';
import {useContext, useMemo} from 'react';
import {StoreContext} from '../context';
import {useSubscription} from '../hooks';

import styles from './ComponentCounts.css';

export default function ComponentCounts(): React.Node {
  const store = useContext(StoreContext);

  const countsSubscription = useMemo(
    () => ({
      getCurrentValue: () => store.getElementCountsByDisplayName(),
      subscribe: (callback: Function) => {
        store.addListener('mutated', callback);
        return () => store.removeListener('mutated', callback);
      },
    }),
    [store],
  );
  const counts = useSubscription(countsSubscription);

  if (counts.length === 0) {
    return <div className={styles.Empty}>No components are mounted.</div>;
  }

  return (
    <div className={styles.ComponentCounts}>
      <div className={styles.Description}>
        Components hidden by component filters are not counted.
      </div>
      <table className={styles.Table}>
        <thead>
          <tr>
            <th className={styles.NameHeader}>Component</th>
            <th className={styles.CountHeader}>Instances</th>
          </tr>
        </thead>
        <tbody>
          {counts.map(({displayName, count}) => (
            <tr key={displayName}>
              <td className={styles.Name}>{displayName}</td>
              <td className={styles.Count}>{count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
