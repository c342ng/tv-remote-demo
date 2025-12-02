/**
 * Concurrency Control Utilities
 *
 * Provides tools for managing concurrent async operations:
 * - PromisePool: Execute tasks with limited concurrency
 * - runWithConcurrency: Simple function for batch execution
 * - Support for cancellation and priority scheduling
 *
 * @module concurrency
 */

/** Debug logger */
const DEBUG_TAG = '[Concurrency]';
const debug = {
  log: (...args: unknown[]) => console.log(DEBUG_TAG, ...args),
  warn: (...args: unknown[]) => console.warn(DEBUG_TAG, ...args),
  error: (...args: unknown[]) => console.error(DEBUG_TAG, ...args),
};

/** Default maximum concurrent tasks */
const DEFAULT_MAX_CONCURRENT = 50;

/**
 * Task with optional priority
 */
export interface PrioritizedTask<T> {
  /** The async task function */
  task: () => Promise<T>;
  /** Priority (lower = higher priority, default = 10) */
  priority?: number;
}

/**
 * Result of running tasks with concurrency control
 */
export interface ConcurrencyResult<T> {
  /** Successfully completed results */
  results: T[];
  /** Errors from failed tasks */
  errors: Error[];
  /** Number of tasks that were cancelled */
  cancelled: number;
  /** Total execution time in milliseconds */
  durationMs: number;
}

/**
 * Cancellable execution result
 */
export interface CancellableExecution<T> {
  /** Promise that resolves with the results */
  promise: Promise<ConcurrencyResult<T>>;
  /** Cancel remaining tasks */
  cancel: () => void;
  /** Check if cancelled */
  isCancelled: () => boolean;
}

/**
 * Promise Pool for controlled concurrent execution
 *
 * @example
 * ```typescript
 * const pool = new PromisePool(10); // Max 10 concurrent
 * const tasks = urls.map(url => () => fetch(url));
 * const results = await pool.run(tasks);
 * ```
 */
export class PromisePool<T = unknown> {
  private _maxConcurrent: number;
  private _running = 0;
  private _cancelled = false;
  private _queue: {
    task: () => Promise<T>;
    priority: number;
    resolve: (value: T) => void;
    reject: (error: Error) => void;
  }[] = [];

  constructor(maxConcurrent: number = DEFAULT_MAX_CONCURRENT) {
    this._maxConcurrent = Math.max(1, maxConcurrent);
  }

  /**
   * Get current concurrency limit
   */
  get maxConcurrent(): number {
    return this._maxConcurrent;
  }

  /**
   * Get number of currently running tasks
   */
  get running(): number {
    return this._running;
  }

  /**
   * Get number of queued tasks
   */
  get queued(): number {
    return this._queue.length;
  }

  /**
   * Check if pool has been cancelled
   */
  get isCancelled(): boolean {
    return this._cancelled;
  }

  /**
   * Add a single task to the pool
   */
  async add(task: () => Promise<T>, priority: number = 10): Promise<T> {
    if (this._cancelled) {
      throw new Error('Pool has been cancelled');
    }

    return new Promise<T>((resolve, reject) => {
      this._queue.push({ task, priority, resolve, reject });
      this._sortQueue();
      this._processQueue();
    });
  }

  /**
   * Run multiple tasks with concurrency control
   */
  async run(tasks: (() => Promise<T>)[] | PrioritizedTask<T>[]): Promise<T[]> {
    if (this._cancelled) {
      throw new Error('Pool has been cancelled');
    }

    const normalizedTasks = tasks.map((t) =>
      typeof t === 'function' ? { task: t, priority: 10 } : t
    );

    const promises = normalizedTasks.map(
      ({ task, priority }) =>
        new Promise<T>((resolve, reject) => {
          this._queue.push({ task, priority: priority ?? 10, resolve, reject });
        })
    );

    this._sortQueue();
    this._processQueue();

    return Promise.all(promises);
  }

  /**
   * Cancel all pending tasks
   */
  cancel(): void {
    this._cancelled = true;
    const cancelError = new Error('Pool cancelled');

    // Reject all queued tasks
    while (this._queue.length > 0) {
      const item = this._queue.shift();
      item?.reject(cancelError);
    }

    debug.log('Pool cancelled');
  }

  /**
   * Reset the pool for reuse
   */
  reset(): void {
    this._cancelled = false;
    this._queue = [];
    this._running = 0;
  }

  /**
   * Sort queue by priority (lower priority number = higher priority)
   */
  private _sortQueue(): void {
    this._queue.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Process queued tasks up to concurrency limit
   */
  private _processQueue(): void {
    while (this._running < this._maxConcurrent && this._queue.length > 0 && !this._cancelled) {
      const item = this._queue.shift();
      if (!item) break;

      this._running++;

      item
        .task()
        .then((result) => {
          item.resolve(result);
        })
        .catch((error) => {
          item.reject(error);
        })
        .finally(() => {
          this._running--;
          this._processQueue();
        });
    }
  }
}

/**
 * Run tasks with concurrency control
 *
 * Simple function for one-off batch execution with cancellation support.
 *
 * @param tasks Array of async task functions
 * @param maxConcurrent Maximum number of concurrent tasks (default: 50)
 * @returns Cancellable execution with results
 *
 * @example
 * ```typescript
 * const tasks = ips.map(ip => () => checkPort(ip, 8060));
 * const { promise, cancel } = runWithConcurrency(tasks, 50);
 *
 * // Can cancel if needed
 * setTimeout(() => cancel(), 5000);
 *
 * const { results, errors, cancelled } = await promise;
 * ```
 */
export function runWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  maxConcurrent: number = DEFAULT_MAX_CONCURRENT
): CancellableExecution<T> {
  let cancelled = false;
  let cancelledCount = 0;
  const startTime = Date.now();
  const results: T[] = [];
  const errors: Error[] = [];

  // Track pending tasks for cancellation
  let pendingCount = tasks.length;
  let resolvePromise: (result: ConcurrencyResult<T>) => void;

  const cancel = () => {
    cancelled = true;
    debug.log('Cancellation requested');
  };

  const isCancelled = () => cancelled;

  const promise = new Promise<ConcurrencyResult<T>>((resolve) => {
    resolvePromise = resolve;

    if (tasks.length === 0) {
      resolve({
        results: [],
        errors: [],
        cancelled: 0,
        durationMs: 0,
      });
      return;
    }

    let running = 0;
    let taskIndex = 0;

    const runNext = () => {
      // Check if all done
      if (pendingCount === 0) {
        resolvePromise({
          results,
          errors,
          cancelled: cancelledCount,
          durationMs: Date.now() - startTime,
        });
        return;
      }

      // Start tasks up to concurrency limit
      while (running < maxConcurrent && taskIndex < tasks.length) {
        if (cancelled) {
          // Skip remaining tasks
          cancelledCount++;
          pendingCount--;
          taskIndex++;
          continue;
        }

        const currentIndex = taskIndex++;
        const task = tasks[currentIndex];
        running++;

        task()
          .then((result) => {
            results.push(result);
          })
          .catch((error) => {
            errors.push(error instanceof Error ? error : new Error(String(error)));
          })
          .finally(() => {
            running--;
            pendingCount--;
            runNext();
          });
      }

      // Handle case where all remaining tasks are cancelled
      while (cancelled && taskIndex < tasks.length) {
        cancelledCount++;
        pendingCount--;
        taskIndex++;
      }

      if (pendingCount === 0) {
        resolvePromise({
          results,
          errors,
          cancelled: cancelledCount,
          durationMs: Date.now() - startTime,
        });
      }
    };

    runNext();
  });

  return { promise, cancel, isCancelled };
}

/**
 * Run prioritized tasks with concurrency control
 *
 * @param tasks Array of prioritized tasks
 * @param maxConcurrent Maximum concurrent tasks
 * @returns Promise resolving to results in completion order
 */
export async function runWithPriority<T>(
  tasks: PrioritizedTask<T>[],
  maxConcurrent: number = DEFAULT_MAX_CONCURRENT
): Promise<ConcurrencyResult<T>> {
  const startTime = Date.now();
  const pool = new PromisePool<T>(maxConcurrent);
  const results: T[] = [];
  const errors: Error[] = [];

  // Sort by priority before execution
  const sortedTasks = [...tasks].sort((a, b) => (a.priority ?? 10) - (b.priority ?? 10));

  const promises = sortedTasks.map(({ task }) =>
    pool
      .add(task)
      .then((result) => {
        results.push(result);
      })
      .catch((error) => {
        errors.push(error instanceof Error ? error : new Error(String(error)));
      })
  );

  await Promise.allSettled(promises);

  return {
    results,
    errors,
    cancelled: 0,
    durationMs: Date.now() - startTime,
  };
}

/**
 * Create a throttled version of an async function
 *
 * @param fn The function to throttle
 * @param maxConcurrent Maximum concurrent executions
 * @returns Throttled function
 */
export function throttle<T extends unknown[], R>(
  fn: (...args: T) => Promise<R>,
  maxConcurrent: number = 1
): (...args: T) => Promise<R> {
  const pool = new PromisePool<R>(maxConcurrent);

  return (...args: T): Promise<R> => {
    return pool.add(() => fn(...args));
  };
}

/**
 * Delay execution for specified milliseconds
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run with timeout - wraps a promise with a timeout
 */
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message?: string
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(message ?? `Operation timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    promise
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}
