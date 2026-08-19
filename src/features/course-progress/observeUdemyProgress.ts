import {
  CourseProgressSnapshot,
  CourseProgressValidator,
  extractRawProgress,
} from './udemy-progress';

export interface ObserveUdemyProgressOptions {
  onProgress: (snapshot: CourseProgressSnapshot) => void;
  root?: ParentNode;
  initialValidationTimeoutMs?: number;
  settleDelayMs?: number;
  debounceMs?: number;
}

type NavigationListener = () => void;

let originalPushState: typeof window.history.pushState | null = null;
let originalReplaceState: typeof window.history.replaceState | null = null;
const activeNavigationListeners = new Set<NavigationListener>();

function handleGlobalNavigation(): void {
  activeNavigationListeners.forEach((listener) => {
    try {
      listener();
    } catch (err) {
      console.error('[Course Progress] Navigation listener error:', err);
    }
  });
}

function subscribeNavigation(listener: NavigationListener): () => void {
  if (typeof window === 'undefined' || !window.history) {
    return () => {};
  }

  activeNavigationListeners.add(listener);

  if (activeNavigationListeners.size === 1) {
    originalPushState = window.history.pushState;
    originalReplaceState = window.history.replaceState;

    window.history.pushState = function (this: History, ...args: any[]) {
      const result = originalPushState!.apply(this, args as any);
      handleGlobalNavigation();
      return result;
    };

    window.history.replaceState = function (this: History, ...args: any[]) {
      const result = originalReplaceState!.apply(this, args as any);
      handleGlobalNavigation();
      return result;
    };

    window.addEventListener('popstate', handleGlobalNavigation);
    window.addEventListener('hashchange', handleGlobalNavigation);
    window.addEventListener('pageshow', handleGlobalNavigation);
  }

  return () => {
    activeNavigationListeners.delete(listener);
    if (activeNavigationListeners.size === 0) {
      if (originalPushState) {
        window.history.pushState = originalPushState;
        originalPushState = null;
      }
      if (originalReplaceState) {
        window.history.replaceState = originalReplaceState;
        originalReplaceState = null;
      }
      window.removeEventListener('popstate', handleGlobalNavigation);
      window.removeEventListener('hashchange', handleGlobalNavigation);
      window.removeEventListener('pageshow', handleGlobalNavigation);
    }
  };
}

export function observeUdemyProgress(options: ObserveUdemyProgressOptions): () => void {
  const {
    onProgress,
    root,
    initialValidationTimeoutMs = 5000,
    settleDelayMs = 1000,
    debounceMs = 50,
  } = options;

  const validator = new CourseProgressValidator({
    onValidatedProgress: onProgress,
    initialValidationTimeoutMs,
    settleDelayMs,
  });

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let isCleanedUp = false;

  const getRootNode = (): ParentNode => {
    if (root) return root;
    if (typeof document === 'undefined') return {} as ParentNode;
    return (
      document.querySelector('.ud-app-loader') ||
      document.querySelector('#udemy') ||
      document.querySelector('.main-content') ||
      document.body ||
      document
    );
  };

  const scheduleExtraction = () => {
    if (isCleanedUp) return;
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      if (isCleanedUp) return;
      const rootNode = getRootNode();
      const raw = extractRawProgress(
        rootNode,
        typeof window !== 'undefined' ? window.location.pathname : ''
      );
      if (raw) {
        validator.processObservation(raw);
      }
    }, debounceMs);
  };

  // Immediate synchronous extraction on setup
  const initialRoot = getRootNode();
  const initialRaw = extractRawProgress(
    initialRoot,
    typeof window !== 'undefined' ? window.location.pathname : ''
  );
  if (initialRaw) {
    validator.processObservation(initialRaw);
  }

  // Set up MutationObserver
  let observer: MutationObserver | null = null;
  if (typeof MutationObserver !== 'undefined' && typeof document !== 'undefined') {
    observer = new MutationObserver((mutations) => {
      // Check if all mutations are within userscript root
      const allInsideUserscript = mutations.every((m) => {
        const target = m.target as HTMLElement | null;
        if (!target) return false;
        return (
          target.closest?.('#cookie-updater-root') ||
          target.closest?.('[data-userscript="true"]') ||
          target.id === 'cookie-updater-root'
        );
      });

      if (allInsideUserscript && mutations.length > 0) {
        return;
      }

      scheduleExtraction();
    });

    const targetNode = root || document.body || document.documentElement;
    if (targetNode) {
      observer.observe(targetNode as Node, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ['data-purpose', 'class'],
      });
    }
  }

  const unsubscribeNavigation = subscribeNavigation(scheduleExtraction);

  // Return cleanup function
  return () => {
    isCleanedUp = true;
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    validator.reset();

    if (observer) {
      observer.disconnect();
      observer = null;
    }

    unsubscribeNavigation();
  };
}
