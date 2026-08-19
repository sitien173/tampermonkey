import { ApiResult, isTransientStatus, UpdateCourseProgressPayload, UpdateCourseProgressResponse } from '../../lib/api';

export interface QueueItem {
  folderId: string;
  courseId: string;
  payload: UpdateCourseProgressPayload;
  revision: number;
}

export interface QueueOptions {
  transport: (item: QueueItem) => Promise<ApiResult<UpdateCourseProgressResponse>>;
  onSuccess?: (item: {
    courseId: string;
    payload: UpdateCourseProgressPayload;
    response?: UpdateCourseProgressResponse;
    revision: number;
  }) => void;
  onError?: (item: { courseId: string; error: string; status?: number; revision: number }) => void;
  onAuthError?: (item: { error: string; status?: number; revision: number }) => void;
  onRematch404?: (item: { courseId: string; payload: UpdateCourseProgressPayload; revision: number }) => Promise<string | null>;
  trailingDelayMs?: number; // default 1000ms
}

interface CourseQueueState {
  folderId: string;
  courseId: string;
  acknowledgedPayload: UpdateCourseProgressPayload | null;
  pendingPayload: UpdateCourseProgressPayload | null;
  inFlight: boolean;
  inFlightPayload: UpdateCourseProgressPayload | null;
  revision: number;
  trailingTimer: ReturnType<typeof setTimeout> | null;
  retries: number;
  rematched404: boolean;
}

function payloadsEqual(a: UpdateCourseProgressPayload | null, b: UpdateCourseProgressPayload | null): boolean {
  if (!a || !b) return false;
  return (
    a.progress === b.progress &&
    a.is_completed === b.is_completed &&
    a.last_lesson_url === b.last_lesson_url
  );
}

export class CourseProgressUpdateQueue {
  private transport: (item: QueueItem) => Promise<ApiResult<UpdateCourseProgressResponse>>;
  private onSuccess?: (item: {
    courseId: string;
    payload: UpdateCourseProgressPayload;
    response?: UpdateCourseProgressResponse;
    revision: number;
  }) => void;
  private onError?: (item: { courseId: string; error: string; status?: number; revision: number }) => void;
  private onAuthError?: (item: { error: string; status?: number; revision: number }) => void;
  private onRematch404?: (item: { courseId: string; payload: UpdateCourseProgressPayload; revision: number }) => Promise<string | null>;
  private trailingDelayMs: number;

  private states = new Map<string, CourseQueueState>();
  private activeRevision: number | null = null;

  constructor(options: QueueOptions) {
    this.transport = options.transport;
    this.onSuccess = options.onSuccess;
    this.onError = options.onError;
    this.onAuthError = options.onAuthError;
    this.onRematch404 = options.onRematch404;
    this.trailingDelayMs = options.trailingDelayMs ?? 1000;
  }

  public reset(): void {
    for (const state of this.states.values()) {
      if (state.trailingTimer !== null) {
        clearTimeout(state.trailingTimer);
        state.trailingTimer = null;
      }
    }
    this.states.clear();
    this.activeRevision = null;
  }

  public enqueue(item: QueueItem): void {
    const { courseId, folderId, payload, revision } = item;

    if (this.activeRevision !== revision) {
      this.reset();
      this.activeRevision = revision;
    }

    let state = this.states.get(courseId);
    if (!state) {
      state = {
        folderId,
        courseId,
        acknowledgedPayload: null,
        pendingPayload: null,
        inFlight: false,
        inFlightPayload: null,
        revision,
        trailingTimer: null,
        retries: 0,
        rematched404: false,
      };
      this.states.set(courseId, state);
    }

    state.folderId = folderId;
    state.revision = revision;

    // Deduplicate against acknowledged payload if no in-flight or pending updates with different values
    if (payloadsEqual(state.acknowledgedPayload, payload)) {
      if (!state.inFlight && !state.pendingPayload) {
        return;
      }
      if (state.pendingPayload && payloadsEqual(state.pendingPayload, payload)) {
        return;
      }
    }

    // Retain only the newest pending payload
    state.pendingPayload = payload;

    // Start or restart trailing timer if not currently in flight
    if (!state.inFlight) {
      if (state.trailingTimer !== null) {
        clearTimeout(state.trailingTimer);
      }
      state.trailingTimer = setTimeout(() => {
        state!.trailingTimer = null;
        this.processNext(courseId);
      }, this.trailingDelayMs);
    }
  }

  private async processNext(courseId: string): Promise<void> {
    const state = this.states.get(courseId);
    if (!state) return;
    if (state.inFlight) return;
    if (!state.pendingPayload) return;

    // If pending payload matches acknowledged, nothing to do
    if (payloadsEqual(state.acknowledgedPayload, state.pendingPayload)) {
      state.pendingPayload = null;
      return;
    }

    const payloadToSend = state.pendingPayload;
    state.pendingPayload = null;
    state.inFlight = true;
    state.inFlightPayload = payloadToSend;

    await this.transmit(state, payloadToSend);
  }

  private async transmit(state: CourseQueueState, payloadToSend: UpdateCourseProgressPayload): Promise<void> {
    const startingRevision = state.revision;

    const result = await this.transport({
      folderId: state.folderId,
      courseId: state.courseId,
      payload: payloadToSend,
      revision: startingRevision,
    });

    // Check if revision changed while in flight
    if (this.activeRevision !== startingRevision || state.revision !== startingRevision) {
      return;
    }

    if (result.ok) {
      state.acknowledgedPayload = payloadToSend;
      state.inFlight = false;
      state.inFlightPayload = null;
      state.retries = 0;
      state.rematched404 = false;

      this.onSuccess?.({
        courseId: state.courseId,
        payload: payloadToSend,
        response: result.data,
        revision: startingRevision,
      });

      // If newer pending payload arrived while in flight, send it
      if (state.pendingPayload && !payloadsEqual(state.acknowledgedPayload, state.pendingPayload)) {
        this.processNext(state.courseId);
      }
      return;
    }

    const status = result.status;

    // 1. Auth errors: 401 or 403
    if (status === 401 || status === 403) {
      state.inFlight = false;
      state.inFlightPayload = null;
      state.retries = 0;
      this.onAuthError?.({ error: result.error, status, revision: startingRevision });
      return;
    }

    // 2. 404 Not Found: attempt rematch once
    if (status === 404) {
      if (!state.rematched404 && this.onRematch404) {
        state.rematched404 = true;
        const newFolderId = await this.onRematch404({
          courseId: state.courseId,
          payload: payloadToSend,
          revision: startingRevision,
        });

        if (this.activeRevision !== startingRevision || state.revision !== startingRevision) {
          return;
        }

        if (newFolderId) {
          state.folderId = newFolderId;
          // If a newer pending payload arrived while rematching, send the newest
          const nextPayload =
            state.pendingPayload && !payloadsEqual(state.acknowledgedPayload, state.pendingPayload)
              ? state.pendingPayload
              : payloadToSend;
          state.pendingPayload = null;
          state.inFlightPayload = nextPayload;
          // Retry once with new folder
          await this.transmit(state, nextPayload);
          return;
        }
      }
      state.inFlight = false;
      state.inFlightPayload = null;
      state.retries = 0;
      this.onError?.({ courseId: state.courseId, error: result.error, status, revision: startingRevision });
      return;
    }

    // 3. Transient errors: 408, 429, network, 5xx
    if (isTransientStatus(status) || status === undefined) {
      if (state.retries < 2) {
        state.retries++;
        // If a newer payload was queued, send the newest
        const nextPayload = state.pendingPayload || payloadToSend;
        state.pendingPayload = null;
        state.inFlightPayload = nextPayload;
        await this.transmit(state, nextPayload);
        return;
      }
    }

    // 4. Permanent errors or retries exhausted (including 400 Bad Request)
    state.inFlight = false;
    state.inFlightPayload = null;
    state.retries = 0;
    this.onError?.({ courseId: state.courseId, error: result.error, status, revision: startingRevision });
  }
}
