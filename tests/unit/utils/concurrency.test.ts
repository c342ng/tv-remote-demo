/**
 * Unit tests for concurrency.ts
 *
 * Tests for:
 * - PromisePool concurrency limiting
 * - runWithConcurrency batch execution
 * - Cancellation mechanism
 * - Priority scheduling (if implemented)
 */

import {
  PromisePool,
  runWithConcurrency,
  runWithPriority,
  throttle,
  delay,
  withTimeout,
} from '../../../src/remote/utils/concurrency';

// Helper to track execution order and concurrency
function createTracker() {
  let running = 0;
  let maxConcurrent = 0;
  const executionOrder: number[] = [];

  return {
    get maxConcurrent() {
      return maxConcurrent;
    },
    get executionOrder() {
      return executionOrder;
    },
    createTask(id: number, duration: number = 10): () => Promise<number> {
      return async () => {
        running++;
        maxConcurrent = Math.max(maxConcurrent, running);
        executionOrder.push(id);
        await delay(duration);
        running--;
        return id;
      };
    },
  };
}

describe('concurrency', () => {
  describe('PromisePool', () => {
    it('should limit concurrent executions', async () => {
      const tracker = createTracker();
      const pool = new PromisePool<number>(3);

      const tasks = Array.from({ length: 10 }, (_, i) => tracker.createTask(i, 20));

      await pool.run(tasks);

      expect(tracker.maxConcurrent).toBeLessThanOrEqual(3);
    });

    it('should execute all tasks', async () => {
      const pool = new PromisePool<number>(5);
      const results: number[] = [];

      const tasks = Array.from({ length: 10 }, (_, i) => async () => {
        results.push(i);
        return i;
      });

      await pool.run(tasks);

      expect(results).toHaveLength(10);
      expect(results.sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    });

    it('should handle empty task array', async () => {
      const pool = new PromisePool<number>(5);
      const results = await pool.run([]);
      expect(results).toEqual([]);
    });

    it('should cancel pending tasks', async () => {
      const pool = new PromisePool<number>(2);
      const executed: number[] = [];

      const tasks = Array.from({ length: 10 }, (_, i) => async () => {
        executed.push(i);
        await delay(50);
        return i;
      });

      // Start tasks but don't await
      const promise = pool.run(tasks);

      // Cancel after a short delay
      await delay(30);
      pool.cancel();

      // Wait for completion
      try {
        await promise;
      } catch {
        // Expected to throw for cancelled tasks
      }

      // Some tasks should have started, but not all
      expect(executed.length).toBeLessThan(10);
    });

    it('should respect max concurrent limit of 1', async () => {
      const tracker = createTracker();
      const pool = new PromisePool<number>(1);

      const tasks = Array.from({ length: 5 }, (_, i) => tracker.createTask(i, 10));

      await pool.run(tasks);

      expect(tracker.maxConcurrent).toBe(1);
    });
  });

  describe('runWithConcurrency', () => {
    it('should limit concurrent executions', async () => {
      const tracker = createTracker();
      const tasks = Array.from({ length: 20 }, (_, i) => tracker.createTask(i, 10));

      const { promise } = runWithConcurrency(tasks, 5);
      await promise;

      expect(tracker.maxConcurrent).toBeLessThanOrEqual(5);
    });

    it('should return results and errors separately', async () => {
      const tasks = [
        async () => 1,
        async () => {
          throw new Error('Task failed');
        },
        async () => 3,
      ];

      const { promise } = runWithConcurrency(tasks, 2);
      const result = await promise;

      expect(result.results).toContain(1);
      expect(result.results).toContain(3);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toBe('Task failed');
    });

    it('should support cancellation', async () => {
      const executed: number[] = [];
      const tasks = Array.from({ length: 100 }, (_, i) => async () => {
        executed.push(i);
        await delay(10);
        return i;
      });

      const { promise, cancel, isCancelled } = runWithConcurrency(tasks, 5);

      // Cancel after short delay
      await delay(30);
      expect(isCancelled()).toBe(false);
      cancel();
      expect(isCancelled()).toBe(true);

      const result = await promise;

      // Should have cancelled some tasks
      expect(result.cancelled).toBeGreaterThan(0);
      expect(executed.length).toBeLessThan(100);
    });

    it('should handle empty task array', async () => {
      const { promise } = runWithConcurrency([], 5);
      const result = await promise;

      expect(result.results).toEqual([]);
      expect(result.errors).toEqual([]);
      expect(result.cancelled).toBe(0);
    });

    it('should report duration', async () => {
      const tasks = [async () => delay(50)];

      const { promise } = runWithConcurrency(tasks, 1);
      const result = await promise;

      expect(result.durationMs).toBeGreaterThanOrEqual(40);
    });
  });

  describe('runWithPriority', () => {
    it('should execute higher priority tasks first', async () => {
      const executionOrder: number[] = [];

      const tasks = [
        {
          task: async () => {
            executionOrder.push(3);
            return 3;
          },
          priority: 30,
        },
        {
          task: async () => {
            executionOrder.push(1);
            return 1;
          },
          priority: 10,
        },
        {
          task: async () => {
            executionOrder.push(2);
            return 2;
          },
          priority: 20,
        },
      ];

      // Use concurrency of 1 to ensure ordered execution
      await runWithPriority(tasks, 1);

      // With concurrency 1 and priority ordering, should execute 1, 2, 3
      expect(executionOrder).toEqual([1, 2, 3]);
    });

    it('should return all results', async () => {
      const tasks = [
        { task: async () => 'a', priority: 1 },
        { task: async () => 'b', priority: 2 },
        { task: async () => 'c', priority: 3 },
      ];

      const result = await runWithPriority(tasks, 3);

      expect(result.results).toHaveLength(3);
      expect(result.results).toContain('a');
      expect(result.results).toContain('b');
      expect(result.results).toContain('c');
    });
  });

  describe('throttle', () => {
    it('should limit concurrent calls', async () => {
      let running = 0;
      let maxRunning = 0;

      const fn = async (id: number) => {
        running++;
        maxRunning = Math.max(maxRunning, running);
        await delay(20);
        running--;
        return id;
      };

      const throttled = throttle(fn, 2);

      // Call 5 times in parallel
      const promises = [throttled(1), throttled(2), throttled(3), throttled(4), throttled(5)];

      await Promise.all(promises);

      expect(maxRunning).toBeLessThanOrEqual(2);
    });
  });

  describe('delay', () => {
    it('should delay for specified time', async () => {
      const start = Date.now();
      await delay(50);
      const elapsed = Date.now() - start;

      expect(elapsed).toBeGreaterThanOrEqual(40);
    });
  });

  describe('withTimeout', () => {
    it('should resolve if completed in time', async () => {
      const promise = delay(10).then(() => 'success');
      const result = await withTimeout(promise, 100);
      expect(result).toBe('success');
    });

    it('should reject if timeout exceeded', async () => {
      const promise = delay(100).then(() => 'success');

      await expect(withTimeout(promise, 20)).rejects.toThrow('timed out');
    });

    it('should use custom timeout message', async () => {
      const promise = delay(100).then(() => 'success');

      await expect(withTimeout(promise, 20, 'Custom timeout')).rejects.toThrow('Custom timeout');
    });

    it('should propagate errors from the original promise', async () => {
      const promise = delay(10).then(() => {
        throw new Error('Original error');
      });

      await expect(withTimeout(promise, 100)).rejects.toThrow('Original error');
    });
  });
});
