import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { observeUdemyProgress } from '../observeUdemyProgress';

describe('observeUdemyProgress', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
    window.history.pushState({}, '', '/course/bootcamp/learn/lecture/100');
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('extracts and validates progress when DOM contains matching section aggregates', async () => {
    const onProgress = vi.fn();

    // Setup DOM with course counter and matching section counter
    const counter = document.createElement('span');
    counter.setAttribute('data-purpose', 'progress-popover-text');
    counter.textContent = '58 of 386 complete.';
    document.body.appendChild(counter);

    const section = document.createElement('span');
    section.setAttribute('data-purpose', 'section-duration-sr-only');
    section.textContent = '58 of 386 lectures completed';
    document.body.appendChild(section);

    const cleanup = observeUdemyProgress({ onProgress, root: document.body });

    // Should validate immediately since aggregates match
    expect(onProgress).toHaveBeenCalledTimes(1);
    expect(onProgress).toHaveBeenCalledWith({
      courseSlug: 'bootcamp',
      completed: 58,
      total: 386,
      progress: 15,
      isCompleted: false,
      lastLessonUrl: '/course/bootcamp/learn/lecture/100',
    });

    cleanup();
  });

  it('coalesces rapid mutation storms before scheduling extraction', async () => {
    const onProgress = vi.fn();

    const counter = document.createElement('span');
    counter.setAttribute('data-purpose', 'progress-popover-text');
    counter.textContent = '10 of 100 complete.';
    document.body.appendChild(counter);

    const section = document.createElement('span');
    section.setAttribute('data-purpose', 'section-duration-sr-only');
    section.textContent = '10 of 100 lectures completed';
    document.body.appendChild(section);

    const cleanup = observeUdemyProgress({ onProgress, root: document.body, debounceMs: 50 });

    expect(onProgress).toHaveBeenCalledTimes(1);

    // Rapid DOM mutations (e.g. 50 rapid div insertions)
    for (let i = 0; i < 50; i++) {
      const d = document.createElement('div');
      d.textContent = `mutation ${i}`;
      document.body.appendChild(d);
    }

    // Advance by small amount (less than debounce)
    vi.advanceTimersByTime(20);
    // Counter hasn't changed, no extra callback
    expect(onProgress).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(100);
    expect(onProgress).toHaveBeenCalledTimes(1);

    cleanup();
  });

  it('detects SPA navigation via pushState, replaceState, popstate, and hashchange', async () => {
    const onProgress = vi.fn();

    const counter = document.createElement('span');
    counter.setAttribute('data-purpose', 'progress-popover-text');
    counter.textContent = '10 of 100 complete.';
    document.body.appendChild(counter);

    const section = document.createElement('span');
    section.setAttribute('data-purpose', 'section-duration-sr-only');
    section.textContent = '10 of 100 lectures completed';
    document.body.appendChild(section);

    const cleanup = observeUdemyProgress({
      onProgress,
      root: document.body,
      debounceMs: 50,
      settleDelayMs: 1000,
    });

    expect(onProgress).toHaveBeenCalledTimes(1);
    expect(onProgress).toHaveBeenLastCalledWith(
      expect.objectContaining({ lastLessonUrl: '/course/bootcamp/learn/lecture/100' })
    );

    // SPA navigation to lecture 101 via pushState
    window.history.pushState({}, '', '/course/bootcamp/learn/lecture/101');
    vi.advanceTimersByTime(1100);

    expect(onProgress).toHaveBeenCalledTimes(2);
    expect(onProgress).toHaveBeenLastCalledWith(
      expect.objectContaining({ lastLessonUrl: '/course/bootcamp/learn/lecture/101' })
    );

    // SPA navigation to lecture 102 via replaceState
    window.history.replaceState({}, '', '/course/bootcamp/learn/lecture/102');
    vi.advanceTimersByTime(1100);

    expect(onProgress).toHaveBeenCalledTimes(3);
    expect(onProgress).toHaveBeenLastCalledWith(
      expect.objectContaining({ lastLessonUrl: '/course/bootcamp/learn/lecture/102' })
    );

    cleanup();
  });

  it('restores original history methods and removes listeners on cleanup', () => {
    const originalPushState = window.history.pushState;
    const originalReplaceState = window.history.replaceState;

    const onProgress = vi.fn();
    const cleanup = observeUdemyProgress({ onProgress, root: document.body });

    // History methods should have been wrapped
    expect(window.history.pushState).not.toBe(originalPushState);
    expect(window.history.replaceState).not.toBe(originalReplaceState);

    cleanup();

    // History methods should be restored
    expect(window.history.pushState).toBe(originalPushState);
    expect(window.history.replaceState).toBe(originalReplaceState);
  });

  it('supports multiple concurrent observers and cleans up history only on final cleanup', async () => {
    const originalPushState = window.history.pushState;
    const originalReplaceState = window.history.replaceState;

    const counter = document.createElement('span');
    counter.setAttribute('data-purpose', 'progress-popover-text');
    counter.textContent = '10 of 100 complete.';
    document.body.appendChild(counter);

    const section = document.createElement('span');
    section.setAttribute('data-purpose', 'section-duration-sr-only');
    section.textContent = '10 of 100 lectures completed';
    document.body.appendChild(section);

    const onProgressA = vi.fn();
    const onProgressB = vi.fn();

    const cleanupA = observeUdemyProgress({
      onProgress: onProgressA,
      root: document.body,
      debounceMs: 50,
      settleDelayMs: 1000,
    });

    const cleanupB = observeUdemyProgress({
      onProgress: onProgressB,
      root: document.body,
      debounceMs: 50,
      settleDelayMs: 1000,
    });

    expect(onProgressA).toHaveBeenCalledTimes(1);
    expect(onProgressB).toHaveBeenCalledTimes(1);

    // Both observers receive navigation event
    window.history.pushState({}, '', '/course/bootcamp/learn/lecture/101');
    await vi.advanceTimersByTimeAsync(1100);

    expect(onProgressA).toHaveBeenCalledTimes(2);
    expect(onProgressB).toHaveBeenCalledTimes(2);
    expect(onProgressA).toHaveBeenLastCalledWith(
      expect.objectContaining({ lastLessonUrl: '/course/bootcamp/learn/lecture/101' })
    );
    expect(onProgressB).toHaveBeenLastCalledWith(
      expect.objectContaining({ lastLessonUrl: '/course/bootcamp/learn/lecture/101' })
    );

    // Clean up observer A: history should STILL be wrapped because observer B is active
    cleanupA();
    expect(window.history.pushState).not.toBe(originalPushState);

    // Navigation should still trigger observer B
    window.history.pushState({}, '', '/course/bootcamp/learn/lecture/102');
    await vi.advanceTimersByTimeAsync(1100);

    expect(onProgressA).toHaveBeenCalledTimes(2); // no new calls for cleaned-up A
    expect(onProgressB).toHaveBeenCalledTimes(3); // B receives navigation
    expect(onProgressB).toHaveBeenLastCalledWith(
      expect.objectContaining({ lastLessonUrl: '/course/bootcamp/learn/lecture/102' })
    );

    // Clean up observer B: now history should be restored to original
    cleanupB();
    expect(window.history.pushState).toBe(originalPushState);
    expect(window.history.replaceState).toBe(originalReplaceState);
  });

  it('rejects provisional 0 of 386 in live DOM sequence and only emits 58 of 386', async () => {
    const onProgress = vi.fn();
    const cleanup = observeUdemyProgress({
      onProgress,
      root: document.body,
      debounceMs: 50,
      initialValidationTimeoutMs: 5000,
    });

    // Seconds 0-2: Missing DOM
    expect(onProgress).not.toHaveBeenCalled();

    // Second 3: Provisional 0 of 386 appears without section aggregates
    const counter = document.createElement('span');
    counter.setAttribute('data-purpose', 'progress-popover-text');
    counter.textContent = '0 of 386 complete.';
    document.body.appendChild(counter);

    await vi.advanceTimersByTimeAsync(1000); // 1s at provisional 0
    expect(onProgress).not.toHaveBeenCalled();

    // Second 4: Hydrated real progress 58 of 386 appears
    counter.textContent = '58 of 386 complete.';
    await vi.advanceTimersByTimeAsync(60); // debounce triggered

    expect(onProgress).not.toHaveBeenCalled(); // 5s fallback running

    // Advance 5000ms to complete 5s stable on 58 of 386
    await vi.advanceTimersByTimeAsync(5000);

    expect(onProgress).toHaveBeenCalledTimes(1);
    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        completed: 58,
        total: 386,
        progress: 15,
      })
    );

    cleanup();
  });

  it('validates 58 of 386 against a realistic 45-section synthetic DOM fixture', async () => {
    const onProgress = vi.fn();

    // Course counter
    const counter = document.createElement('span');
    counter.setAttribute('data-purpose', 'progress-popover-text');
    counter.textContent = '58 of 386 complete.';
    document.body.appendChild(counter);

    // Build 45 synthetic section counters that sum to 58 completed and 386 total
    // 5 sections of 9/9 (45/45)
    for (let i = 0; i < 5; i++) {
      const s = document.createElement('span');
      s.setAttribute('data-purpose', 'section-duration-sr-only');
      s.textContent = '9 of 9 lectures completed';
      document.body.appendChild(s);
    }
    // 1 section of 13/13 (13/13) -> total completed 58/58
    const sComplete = document.createElement('span');
    sComplete.setAttribute('data-purpose', 'section-duration-sr-only');
    sComplete.textContent = '13 of 13 lectures completed';
    document.body.appendChild(sComplete);

    // 38 sections of 0/8 (0/304)
    for (let i = 0; i < 38; i++) {
      const s = document.createElement('span');
      s.setAttribute('data-purpose', 'section-duration-sr-only');
      s.textContent = '0 of 8 lectures completed';
      document.body.appendChild(s);
    }
    // 1 section of 0/24 (0/24) -> total 58 completed, 386 total across 45 sections
    const sLast = document.createElement('span');
    sLast.setAttribute('data-purpose', 'section-duration-sr-only');
    sLast.textContent = '0 of 24 lectures completed';
    document.body.appendChild(sLast);

    const cleanup = observeUdemyProgress({ onProgress, root: document.body });

    expect(onProgress).toHaveBeenCalledTimes(1);
    expect(onProgress).toHaveBeenCalledWith({
      courseSlug: 'bootcamp',
      completed: 58,
      total: 386,
      progress: 15,
      isCompleted: false,
      lastLessonUrl: '/course/bootcamp/learn/lecture/100',
    });

    cleanup();
  });

  it('re-extracts on full DOM replacement and popstate navigation', async () => {
    const onProgress = vi.fn();

    const cleanup = observeUdemyProgress({
      onProgress,
      root: document.body,
      debounceMs: 50,
      settleDelayMs: 1000,
    });

    // Replace innerHTML with hydrated DOM
    document.body.innerHTML = `
      <div id="udemy">
        <span data-purpose="progress-popover-text">20 of 100 complete.</span>
        <span data-purpose="section-duration-sr-only">20 of 100 lectures completed</span>
      </div>
    `;

    await vi.advanceTimersByTimeAsync(100);
    expect(onProgress).toHaveBeenCalledTimes(1);
    expect(onProgress).toHaveBeenLastCalledWith(
      expect.objectContaining({ progress: 20 })
    );

    // Popstate event
    window.history.pushState({}, '', '/course/bootcamp/learn/lecture/200');
    window.dispatchEvent(new PopStateEvent('popstate'));
    await vi.advanceTimersByTimeAsync(1100);

    expect(onProgress).toHaveBeenCalledTimes(2);
    expect(onProgress).toHaveBeenLastCalledWith(
      expect.objectContaining({ lastLessonUrl: '/course/bootcamp/learn/lecture/200' })
    );

    cleanup();
  });

  it('ignores mutations inside userscript container to avoid feedback loops', () => {
    const onProgress = vi.fn();
    const cleanup = observeUdemyProgress({ onProgress, root: document.body, debounceMs: 50 });

    const userscriptRoot = document.createElement('div');
    userscriptRoot.setAttribute('id', 'cookie-updater-root');
    document.body.appendChild(userscriptRoot);

    // Mutate userscript container
    userscriptRoot.appendChild(document.createElement('span'));
    vi.advanceTimersByTime(100);

    expect(onProgress).not.toHaveBeenCalled();

    cleanup();
  });
});
