import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CourseProgressUpdateQueue } from '../update-queue';
import { UpdateCourseProgressPayload } from '../../../lib/api';

describe('CourseProgressUpdateQueue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('deduplicates identical updates against acknowledged state', async () => {
    const transport = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    const onSuccess = vi.fn();
    const queue = new CourseProgressUpdateQueue({ transport, onSuccess });

    const payload: UpdateCourseProgressPayload = {
      progress: 15,
      is_completed: false,
      last_lesson_url: '/course/bootcamp/learn/lecture/1',
    };

    // First enqueue
    queue.enqueue({
      folderId: 'folder-1',
      courseId: 'course-1',
      payload,
      revision: 1,
    });

    // Advance 1s trailing delay
    await vi.advanceTimersByTimeAsync(1000);

    expect(transport).toHaveBeenCalledTimes(1);
    expect(onSuccess).toHaveBeenCalledTimes(1);

    // Enqueue identical payload again
    queue.enqueue({
      folderId: 'folder-1',
      courseId: 'course-1',
      payload,
      revision: 1,
    });

    await vi.advanceTimersByTimeAsync(2000);
    expect(transport).toHaveBeenCalledTimes(1); // not called again
  });

  it('coalesces rapid 20, 30, 40 updates and retains only 40', async () => {
    const transport = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    const onSuccess = vi.fn();
    const queue = new CourseProgressUpdateQueue({ transport, onSuccess, trailingDelayMs: 1000 });

    queue.enqueue({
      folderId: 'folder-1',
      courseId: 'course-1',
      payload: { progress: 20, is_completed: false, last_lesson_url: '/course/c/learn/lecture/1' },
      revision: 1,
    });

    await vi.advanceTimersByTimeAsync(300);

    queue.enqueue({
      folderId: 'folder-1',
      courseId: 'course-1',
      payload: { progress: 30, is_completed: false, last_lesson_url: '/course/c/learn/lecture/2' },
      revision: 1,
    });

    await vi.advanceTimersByTimeAsync(300);

    queue.enqueue({
      folderId: 'folder-1',
      courseId: 'course-1',
      payload: { progress: 40, is_completed: false, last_lesson_url: '/course/c/learn/lecture/3' },
      revision: 1,
    });

    // Advance past the trailing delay
    await vi.advanceTimersByTimeAsync(1000);

    // Only one PUT should have been transmitted with progress 40
    expect(transport).toHaveBeenCalledTimes(1);
    expect(transport).toHaveBeenCalledWith(
      expect.objectContaining({
        courseId: 'course-1',
        payload: expect.objectContaining({ progress: 40 }),
      })
    );
  });

  it('retries transient failures (500) at most twice', async () => {
    const transport = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 500, error: 'Server Error' })
      .mockResolvedValueOnce({ ok: false, status: 502, error: 'Bad Gateway' })
      .mockResolvedValueOnce({ ok: true, status: 200 });

    const onSuccess = vi.fn();
    const onError = vi.fn();
    const queue = new CourseProgressUpdateQueue({ transport, onSuccess, onError, trailingDelayMs: 100 });

    queue.enqueue({
      folderId: 'folder-1',
      courseId: 'course-1',
      payload: { progress: 50, is_completed: false, last_lesson_url: '/course/c/learn/lecture/1' },
      revision: 1,
    });

    await vi.advanceTimersByTimeAsync(500);

    // 1 initial attempt + 2 retries = 3 attempts, final succeeds
    expect(transport).toHaveBeenCalledTimes(3);
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
  });

  it('does not retry 400 Bad Request error', async () => {
    const transport = vi.fn().mockResolvedValueOnce({ ok: false, status: 400, error: 'Bad Request' });
    const onError = vi.fn();
    const queue = new CourseProgressUpdateQueue({ transport, onError, trailingDelayMs: 100 });

    queue.enqueue({
      folderId: 'folder-1',
      courseId: 'course-1',
      payload: { progress: 50, is_completed: false, last_lesson_url: null },
      revision: 1,
    });

    await vi.advanceTimersByTimeAsync(500);

    expect(transport).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
  });

  it('notifies onAuthError on 401 or 403 response', async () => {
    const transport = vi.fn().mockResolvedValueOnce({ ok: false, status: 401, error: 'Unauthorized' });
    const onAuthError = vi.fn();
    const queue = new CourseProgressUpdateQueue({ transport, onAuthError, trailingDelayMs: 100 });

    queue.enqueue({
      folderId: 'folder-1',
      courseId: 'course-1',
      payload: { progress: 50, is_completed: false, last_lesson_url: null },
      revision: 1,
    });

    await vi.advanceTimersByTimeAsync(500);

    expect(transport).toHaveBeenCalledTimes(1);
    expect(onAuthError).toHaveBeenCalledWith(expect.objectContaining({ status: 401 }));
  });

  it('rematches and retries once on 404 response', async () => {
    const transport = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 404, error: 'Not Found' }) // first attempt with folder-old
      .mockResolvedValueOnce({ ok: true, status: 200 }); // retry with folder-new

    const onRematch404 = vi.fn().mockResolvedValue('folder-new');
    const onSuccess = vi.fn();
    const queue = new CourseProgressUpdateQueue({ transport, onRematch404, onSuccess, trailingDelayMs: 100 });

    queue.enqueue({
      folderId: 'folder-old',
      courseId: 'course-1',
      payload: { progress: 50, is_completed: false, last_lesson_url: null },
      revision: 1,
    });

    await vi.advanceTimersByTimeAsync(500);

    expect(onRematch404).toHaveBeenCalledWith(expect.objectContaining({ courseId: 'course-1' }));
    expect(transport).toHaveBeenCalledTimes(2);
    expect(transport).toHaveBeenLastCalledWith(expect.objectContaining({ folderId: 'folder-new' }));
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it('silently discards responses if revision changes while in flight', async () => {
    let resolveInFlight: (val: any) => void;
    const inFlightPromise = new Promise((resolve) => {
      resolveInFlight = resolve;
    });

    const transport = vi.fn().mockReturnValue(inFlightPromise);
    const onSuccess = vi.fn();
    const queue = new CourseProgressUpdateQueue({ transport, onSuccess, trailingDelayMs: 100 });

    queue.enqueue({
      folderId: 'folder-1',
      courseId: 'course-1',
      payload: { progress: 50, is_completed: false, last_lesson_url: null },
      revision: 1,
    });

    await vi.advanceTimersByTimeAsync(150);
    expect(transport).toHaveBeenCalledTimes(1);

    // License revision changes to 2
    queue.reset();

    // Now in-flight request finishes for revision 1
    resolveInFlight!({ ok: true, status: 200 });
    await vi.advanceTimersByTimeAsync(100);

    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('retries newest pending payload (40) when 30 was in flight and 404 rematch occurs', async () => {
    let resolveFirstTransport: (val: any) => void;
    const firstTransportPromise = new Promise((resolve) => {
      resolveFirstTransport = resolve;
    });

    const transport = vi
      .fn()
      .mockReturnValueOnce(firstTransportPromise) // in flight for 30
      .mockResolvedValueOnce({ ok: true, status: 200 }); // retry after rematch

    const onRematch404 = vi.fn().mockResolvedValue('folder-new');
    const onSuccess = vi.fn();
    const queue = new CourseProgressUpdateQueue({ transport, onRematch404, onSuccess, trailingDelayMs: 100 });

    // Enqueue 30
    queue.enqueue({
      folderId: 'folder-old',
      courseId: 'course-1',
      payload: { progress: 30, is_completed: false, last_lesson_url: null },
      revision: 1,
    });

    // Advance to trigger transport for 30
    await vi.advanceTimersByTimeAsync(150);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(transport).toHaveBeenLastCalledWith(
      expect.objectContaining({
        folderId: 'folder-old',
        payload: expect.objectContaining({ progress: 30 }),
      })
    );

    // While 30 is in flight, enqueue 40
    queue.enqueue({
      folderId: 'folder-old',
      courseId: 'course-1',
      payload: { progress: 40, is_completed: false, last_lesson_url: null },
      revision: 1,
    });

    // First request returns 404
    resolveFirstTransport!({ ok: false, status: 404, error: 'Not Found' });
    await vi.advanceTimersByTimeAsync(100);

    // Rematch was called
    expect(onRematch404).toHaveBeenCalledTimes(1);

    // Second request sent with new folder and newest payload (40)
    expect(transport).toHaveBeenCalledTimes(2);
    expect(transport).toHaveBeenLastCalledWith(
      expect.objectContaining({
        folderId: 'folder-new',
        payload: expect.objectContaining({ progress: 40 }),
      })
    );
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onSuccess).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ progress: 40 }),
      })
    );
  });
});
