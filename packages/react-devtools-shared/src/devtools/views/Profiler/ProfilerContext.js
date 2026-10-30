/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import type {ReactContext} from 'shared/ReactTypes';

import * as React from 'react';
import {
  createContext,
  useCallback,
  useContext,
  useDeferredValue,
  useMemo,
  useReducer,
} from 'react';
import {useLocalStorage, useSubscription} from '../hooks';
import {
  TreeDispatcherContext,
  TreeStateContext,
} from '../Components/TreeContext';
import {StoreContext} from '../context';
import {createRegExp} from '../utils';
import {logEvent} from 'react-devtools-shared/src/Logger';
import {useCommitFilteringAndNavigation} from './useCommitFilteringAndNavigation';

import type {
  CommitDataFrontend,
  CommitTree,
  CommitTreeNode,
  ProfilingDataFrontend,
} from './types';

export type TabID = 'flame-chart' | 'ranked-chart';

type SearchResult = {id: number, name: string | null};

// Reused by every empty search, so it doesn't count as a change in results.
const NO_SEARCH_RESULTS: Array<SearchResult> = [];

function fiberMatchesQuery(node: CommitTreeNode, regExp: RegExp): boolean {
  const {displayName, hocDisplayNames, key} = node;
  return (
    (displayName !== null && regExp.test(displayName)) ||
    (hocDisplayNames !== null &&
      hocDisplayNames.some(name => regExp.test(name))) ||
    (key !== null && regExp.test(String(key)))
  );
}

// Collect the fibers in a commit tree that match `text`, in tree (pre-order)
// order. Kept module-level and pure so it isn't recreated on every render.
function collectSearchMatches(
  commitTree: CommitTree,
  text: string,
): Array<SearchResult> {
  const regExp = createRegExp(text);
  const matches: Array<SearchResult> = [];
  const visit = (id: number) => {
    const node = commitTree.nodes.get(id);
    if (node == null) {
      return;
    }
    if (fiberMatchesQuery(node, regExp)) {
      matches.push({id, name: node.displayName});
    }
    node.children.forEach(visit);
  };
  visit(commitTree.rootID);
  return matches;
}

export type Context = {
  // Which tab is selected in the Profiler UI?
  selectedTabID: TabID,
  selectTab(id: TabID): void,

  // Store subscription based values.
  // The isProfiling value may be modified by the record button in the Profiler toolbar,
  // or from the backend itself (after a reload-and-profile action).
  // It is synced between the backend and frontend via a Store subscription.
  didRecordCommits: boolean,
  isProcessingData: boolean,
  isProfiling: boolean,
  profilingData: ProfilingDataFrontend | null,
  startProfiling(): void,
  stopProfiling(): void,
  supportsProfiling: boolean,

  // Which root should profiling data be shown for?
  // This value should be initialized to either:
  // 1. The selected root in the Components tree (if it has any profiling data) or
  // 2. The first root in the list with profiling data.
  rootID: number | null,
  setRootID: (id: number) => void,

  // Controls whether commits are filtered by duration.
  // This value is controlled by a filter toggle UI in the Profiler toolbar.
  // It impacts the commit selector UI as well as the fiber commits bar chart.
  isCommitFilterEnabled: boolean,
  setIsCommitFilterEnabled: (value: boolean) => void,
  minCommitDuration: number,
  setMinCommitDuration: (value: number) => void,

  // Which commit is currently selected in the commit selector UI.
  // Note that this is the index of the commit in all commits (non-filtered) that were profiled.
  // This value is controlled by the commit selector UI in the Profiler toolbar.
  // It impacts the flame graph and ranked charts.
  selectedCommitIndex: number | null,
  selectCommitIndex: (value: number | null) => void,
  selectNextCommitIndex(): void,
  selectPrevCommitIndex(): void,

  // Which commits are currently filtered by duration?
  filteredCommitIndices: Array<number>,
  selectedFilteredCommitIndex: number | null,

  // Which fiber is currently selected in the Ranked or Flamegraph charts?
  selectedFiberID: number | null,
  selectedFiberName: string | null,
  selectFiber: (id: number | null, name: string | null) => void,

  // Component search within the currently selected commit.
  // Toggled by Cmd/Ctrl+F in the flame graph and ranked charts.
  // Unlike the Components tab, results are scoped to the selected commit only.
  isSearchInputVisible: boolean,
  showSearchInput(): void,
  hideSearchInput(): void,
  searchText: string,
  setSearchText: (text: string) => void,
  searchResults: Array<SearchResult>,
  searchIndex: number,
  searchIsPending: boolean,
  goToNextSearchResult(): void,
  goToPreviousSearchResult(): void,
  goToSearchResult: (index: number) => void,
};

const ProfilerContext: ReactContext<Context> = createContext<Context>(
  null as any as Context,
);
ProfilerContext.displayName = 'ProfilerContext';

type StoreProfilingState = {
  didRecordCommits: boolean,
  isProcessingData: boolean,
  isProfiling: boolean,
  profilingData: ProfilingDataFrontend | null,
  supportsProfiling: boolean,
};

type State = {
  // The profiling data that the selections below were made in.
  profilingData: ProfilingDataFrontend | null,

  rootID: number | null,
  selectedCommitIndex: number | null,
  selectedFiberID: number | null,
  selectedFiberName: string | null,

  // Component search (scoped to the currently selected commit).
  isSearchInputVisible: boolean,
  searchText: string,
  // Matches for the (deferred) search text, computed during render.
  searchResults: Array<SearchResult>,
  searchIndex: number,
};

type Action =
  | {
      type: 'HANDLE_PROFILING_DATA_CHANGE',
      payload: {
        profilingData: ProfilingDataFrontend | null,
        // Root of the element that is selected in the Components tab (if any).
        preferredRootID: number | null,
      },
    }
  | {type: 'SELECT_ROOT', payload: number | null}
  | {type: 'SELECT_COMMIT_INDEX', payload: number | null}
  | {type: 'SELECT_FIBER', payload: {id: number | null, name: string | null}}
  | {type: 'SHOW_SEARCH_INPUT'}
  | {type: 'HIDE_SEARCH_INPUT'}
  | {type: 'SET_SEARCH_TEXT', payload: string}
  | {type: 'HANDLE_SEARCH_RESULTS_CHANGE', payload: Array<SearchResult>}
  | {type: 'GO_TO_NEXT_SEARCH_RESULT'}
  | {type: 'GO_TO_PREVIOUS_SEARCH_RESULT'}
  | {type: 'GO_TO_SEARCH_RESULT', payload: number};

const initialState: State = {
  profilingData: null,

  rootID: null,
  selectedCommitIndex: null,
  selectedFiberID: null,
  selectedFiberName: null,

  isSearchInputVisible: false,
  searchText: '',
  searchResults: NO_SEARCH_RESULTS,
  searchIndex: -1,
};

// Commit indices are specific to a root, so selecting a root starts at its first commit.
function getFirstCommitIndex(
  profilingData: ProfilingDataFrontend | null,
  rootID: number | null,
): number | null {
  if (profilingData === null || rootID === null) {
    return null;
  }
  const dataForRoot = profilingData.dataForRoots.get(rootID);
  return dataForRoot != null && dataForRoot.commitData.length > 0 ? 0 : null;
}

// While a search is active, the selected fiber follows the current match.
// Note that this only updates the Profiler's own selection (a reducer can't
// dispatch into the Components tree), so search navigation intentionally
// does not sync selection to the Components tab.
function selectCurrentSearchResult(state: State): State {
  const {searchIndex, searchResults, searchText} = state;
  if (searchText === '') {
    return state;
  }
  if (searchResults.length === 0) {
    return {...state, selectedFiberID: null, selectedFiberName: null};
  }
  const index =
    searchIndex < 0 || searchIndex >= searchResults.length ? 0 : searchIndex;
  const {id, name} = searchResults[index];
  return {...state, selectedFiberID: id, selectedFiberName: name};
}

function reduceProfilerState(state: State, action: Action): State {
  switch (action.type) {
    case 'HANDLE_PROFILING_DATA_CHANGE': {
      const {profilingData, preferredRootID} = action.payload;
      if (profilingData === state.profilingData) {
        return state;
      }

      // Keep the selected root so long as it has data in the new session.
      // Otherwise prefer the root selected in the Components tab, then the first root with data.
      let rootID = state.rootID;
      if (profilingData !== null) {
        const {dataForRoots} = profilingData;
        if (rootID === null || !dataForRoots.has(rootID)) {
          if (preferredRootID !== null && dataForRoots.has(preferredRootID)) {
            rootID = preferredRootID;
          } else {
            rootID = dataForRoots.keys().next().value || null;
          }
        }
      }

      // Everything else was selected within the previous data, so start over.
      return {
        ...initialState,
        profilingData,
        rootID,
        selectedCommitIndex: getFirstCommitIndex(profilingData, rootID),
      };
    }
    case 'SELECT_ROOT': {
      const rootID = action.payload;
      return {
        ...state,
        rootID,
        selectedCommitIndex: getFirstCommitIndex(state.profilingData, rootID),
        selectedFiberID: null,
        selectedFiberName: null,
      };
    }
    case 'SELECT_COMMIT_INDEX':
      return {...state, selectedCommitIndex: action.payload};
    case 'SELECT_FIBER':
      return {
        ...state,
        selectedFiberID: action.payload.id,
        selectedFiberName: action.payload.name,
      };
    case 'SHOW_SEARCH_INPUT':
      return {...state, isSearchInputVisible: true};
    case 'HIDE_SEARCH_INPUT':
      return {
        ...state,
        isSearchInputVisible: false,
        searchText: '',
        searchIndex: -1,
      };
    case 'SET_SEARCH_TEXT': {
      const searchText = action.payload;
      return selectCurrentSearchResult({
        ...state,
        searchText,
        searchIndex: searchText === '' ? -1 : 0,
      });
    }
    case 'HANDLE_SEARCH_RESULTS_CHANGE':
      return selectCurrentSearchResult({
        ...state,
        searchResults: action.payload,
      });
    case 'GO_TO_NEXT_SEARCH_RESULT': {
      const count = state.searchResults.length;
      const prevIndex = state.searchIndex;
      let searchIndex = -1;
      if (count > 0) {
        searchIndex =
          prevIndex < 0 || prevIndex >= count ? 0 : (prevIndex + 1) % count;
      }
      return selectCurrentSearchResult({...state, searchIndex});
    }
    case 'GO_TO_PREVIOUS_SEARCH_RESULT': {
      const count = state.searchResults.length;
      const prevIndex = state.searchIndex;
      let searchIndex = -1;
      if (count > 0) {
        const current = prevIndex < 0 || prevIndex >= count ? count : prevIndex;
        searchIndex = current <= 0 ? count - 1 : current - 1;
      }
      return selectCurrentSearchResult({...state, searchIndex});
    }
    case 'GO_TO_SEARCH_RESULT':
      return selectCurrentSearchResult({...state, searchIndex: action.payload});
    default:
      throw new Error(`Unrecognized action "${action.type}"`);
  }
}

type Props = {
  children: React$Node,
};

function ProfilerContextController({children}: Props): React.Node {
  const store = useContext(StoreContext);
  const {inspectedElementID} = useContext(TreeStateContext);
  const treeDispatch = useContext(TreeDispatcherContext);

  const {profilerStore} = store;

  const subscription = useMemo(
    () => ({
      getCurrentValue: () => ({
        didRecordCommits: profilerStore.didRecordCommits,
        isProcessingData: profilerStore.isProcessingData,
        isProfiling: profilerStore.isProfilingBasedOnUserInput,
        profilingData: profilerStore.profilingData,
        supportsProfiling: store.rootSupportsBasicProfiling,
      }),
      subscribe: (callback: Function) => {
        profilerStore.addListener('profilingData', callback);
        profilerStore.addListener('isProcessingData', callback);
        profilerStore.addListener('isProfiling', callback);
        store.addListener('rootSupportsBasicProfiling', callback);
        return () => {
          profilerStore.removeListener('profilingData', callback);
          profilerStore.removeListener('isProcessingData', callback);
          profilerStore.removeListener('isProfiling', callback);
          store.removeListener('rootSupportsBasicProfiling', callback);
        };
      },
    }),
    [profilerStore, store],
  );
  const {
    didRecordCommits,
    isProcessingData,
    isProfiling,
    profilingData,
    supportsProfiling,
  } = useSubscription<StoreProfilingState>(subscription);

  const [state, dispatch] = useReducer<State, State, Action>(
    reduceProfilerState,
    initialState,
  );
  const {
    rootID,
    selectedCommitIndex,
    selectedFiberID,
    selectedFiberName,
    isSearchInputVisible,
    searchText,
    searchResults,
    searchIndex,
  } = state;

  // Selections only make sense within the profiling data they were made in.
  // When that data changes (a new session, an import, or a clear), reset them
  // *during render*, so the new data is never shown with stale selections.
  // This follows https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  if (state.profilingData !== profilingData) {
    dispatch({
      type: 'HANDLE_PROFILING_DATA_CHANGE',
      payload: {
        profilingData,
        preferredRootID:
          inspectedElementID !== null
            ? store.getRootIDForElement(inspectedElementID)
            : null,
      },
    });
  }

  const selectFiber = useCallback(
    (id: number | null, name: string | null) => {
      dispatch({type: 'SELECT_FIBER', payload: {id, name}});

      // Sync selection to the Components tab for convenience.
      // Keep in mind that profiling data may be from a previous session.
      // If data has been imported, we should skip the selection sync.
      if (
        id !== null &&
        profilingData !== null &&
        profilingData.imported === false
      ) {
        // We should still check to see if this element is still in the store.
        // It may have been removed during profiling.
        if (store.containsElement(id)) {
          treeDispatch({
            type: 'SELECT_ELEMENT_BY_ID',
            payload: id,
          });
        }
      }
    },
    [treeDispatch, store, profilingData],
  );

  const setRootID = useCallback(
    (id: number | null) => dispatch({type: 'SELECT_ROOT', payload: id}),
    [],
  );

  const [persistedTabID, selectTab] = useLocalStorage<TabID>(
    'React::DevTools::Profiler::defaultTab',
    'flame-chart',
    value => {
      logEvent({
        event_name: 'profiler-tab-changed',
        metadata: {
          tabId: value,
        },
      });
    },
  );

  // The persisted value may name a tab that no longer exists,
  // e.g. the removed "timeline" tab. Fall back rather than render nothing.
  const selectedTabID: TabID =
    persistedTabID === 'ranked-chart' ? persistedTabID : 'flame-chart';

  const stopProfiling = useCallback(
    () => store.profilerStore.stopProfiling(),
    [store],
  );

  // Get commit data for the current root
  // NOTE: Unlike profilerStore.getDataForRoot() which uses Suspense (throws when data unavailable),
  // this uses subscription pattern and returns [] when data isn't ready.
  // Always check didRecordCommits before using commitData or filteredCommitIndices.
  const commitData = useMemo(() => {
    if (!didRecordCommits || rootID === null || profilingData === null) {
      return [] as Array<CommitDataFrontend>;
    }
    const dataForRoot = profilingData.dataForRoots.get(rootID);
    return dataForRoot
      ? dataForRoot.commitData
      : ([] as Array<CommitDataFrontend>);
  }, [didRecordCommits, rootID, profilingData]);

  const selectCommitIndex = useCallback(
    (index: number | null) =>
      dispatch({type: 'SELECT_COMMIT_INDEX', payload: index}),
    [],
  );

  // Commit filtering and navigation
  const {
    isCommitFilterEnabled,
    setIsCommitFilterEnabled,
    minCommitDuration,
    setMinCommitDuration,
    filteredCommitIndices,
    selectedFilteredCommitIndex,
    selectNextCommitIndex,
    selectPrevCommitIndex,
  } = useCommitFilteringAndNavigation(
    commitData,
    selectedCommitIndex,
    selectCommitIndex,
  );

  // Fibers in the selected commit matching `text`, scoped to the current
  // commit only (never the whole trace).
  const findMatches = useCallback(
    (text: string): Array<SearchResult> => {
      if (
        text === '' ||
        rootID === null ||
        selectedCommitIndex === null ||
        !didRecordCommits
      ) {
        return NO_SEARCH_RESULTS;
      }
      const commitTree = profilerStore.profilingCache.getCommitTree({
        commitIndex: selectedCommitIndex,
        rootID,
      });
      return collectSearchMatches(commitTree, text);
    },
    [rootID, selectedCommitIndex, didRecordCommits, profilerStore],
  );

  // Keep the controlled input update synchronous (see setSearchText), but
  // derive matches from a *deferred* value so the tree walk runs at transition
  // priority and never blocks typing. Deriving via a memo also keeps results
  // scoped to the current commit for free (findMatches tracks selectedCommitIndex).
  const deferredSearchText = useDeferredValue(searchText);
  const searchIsPending = searchText !== deferredSearchText;
  const currentSearchResults = useMemo<Array<SearchResult>>(
    () => findMatches(deferredSearchText),
    [findMatches, deferredSearchText],
  );

  // Hand new matches to the reducer *during render* rather than in an effect,
  // so results and the selected fiber commit together (no post-paint frame
  // showing a stale/empty selection).
  if (state.searchResults !== currentSearchResults) {
    dispatch({
      type: 'HANDLE_SEARCH_RESULTS_CHANGE',
      payload: currentSearchResults,
    });
  }

  // Synchronous so the input stays responsive; the results recompute off the
  // deferred value at transition priority.
  const setSearchText = useCallback(
    (text: string) => dispatch({type: 'SET_SEARCH_TEXT', payload: text}),
    [],
  );

  const goToNextSearchResult = useCallback(
    () => dispatch({type: 'GO_TO_NEXT_SEARCH_RESULT'}),
    [],
  );

  const goToPreviousSearchResult = useCallback(
    () => dispatch({type: 'GO_TO_PREVIOUS_SEARCH_RESULT'}),
    [],
  );

  const goToSearchResult = useCallback(
    (index: number) => dispatch({type: 'GO_TO_SEARCH_RESULT', payload: index}),
    [],
  );

  const showSearchInput = useCallback(
    () => dispatch({type: 'SHOW_SEARCH_INPUT'}),
    [],
  );

  const hideSearchInput = useCallback(
    () => dispatch({type: 'HIDE_SEARCH_INPUT'}),
    [],
  );

  const startProfiling = useCallback(() => {
    logEvent({
      event_name: 'profiling-start',
      metadata: {current_tab: selectedTabID},
    });

    // Starting a new session clears the profiling data,
    // which also resets the commit, fiber, and search selections.
    store.profilerStore.startProfiling();
  }, [store, selectedTabID]);

  const value = useMemo(
    () => ({
      selectedTabID,
      selectTab,

      didRecordCommits,
      isProcessingData,
      isProfiling,
      profilingData,
      startProfiling,
      stopProfiling,
      supportsProfiling,

      rootID,
      setRootID,

      isCommitFilterEnabled,
      setIsCommitFilterEnabled,
      minCommitDuration,
      setMinCommitDuration,

      selectedCommitIndex,
      selectCommitIndex,
      selectNextCommitIndex,
      selectPrevCommitIndex,
      filteredCommitIndices,
      selectedFilteredCommitIndex,

      selectedFiberID,
      selectedFiberName,
      selectFiber,

      isSearchInputVisible,
      showSearchInput,
      hideSearchInput,
      searchText,
      setSearchText,
      searchResults,
      searchIndex,
      searchIsPending,
      goToNextSearchResult,
      goToPreviousSearchResult,
      goToSearchResult,
    }),
    [
      selectedTabID,
      selectTab,

      didRecordCommits,
      isProcessingData,
      isProfiling,
      profilingData,
      startProfiling,
      stopProfiling,
      supportsProfiling,

      rootID,
      setRootID,

      isCommitFilterEnabled,
      setIsCommitFilterEnabled,
      minCommitDuration,
      setMinCommitDuration,

      selectedCommitIndex,
      selectCommitIndex,
      selectNextCommitIndex,
      selectPrevCommitIndex,
      filteredCommitIndices,
      selectedFilteredCommitIndex,

      selectedFiberID,
      selectedFiberName,
      selectFiber,

      isSearchInputVisible,
      showSearchInput,
      hideSearchInput,
      searchText,
      setSearchText,
      searchResults,
      searchIndex,
      searchIsPending,
      goToNextSearchResult,
      goToPreviousSearchResult,
      goToSearchResult,
    ],
  );

  return (
    <ProfilerContext.Provider value={value}>
      {children}
    </ProfilerContext.Provider>
  );
}

export {ProfilerContext, ProfilerContextController};
