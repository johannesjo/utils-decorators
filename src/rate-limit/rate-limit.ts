import {RateLimitable, RateLimitConfigs} from './rate-limit.model';
import {Method} from '../common/model/common.model';
import {TaskExec} from '../common/tesk-exec/task-exec';
import {SimpleRateLimitCounter} from './simple-rate-limit-counter';

async function handleAsyncRateLimit<T, D>(
  target: T,
  resolvedConfig: RateLimitConfigs,
  key: string,
  taskExec: TaskExec,
  originalMethod: (...x: any[]) => Promise<D>,
  args: any[],
): Promise<D> {
  const rateLimitCounter = resolvedConfig.rateLimitAsyncCounter;
  const currentCount = await rateLimitCounter.getCount(key);

  if (currentCount >= resolvedConfig.allowedCalls) {
    resolvedConfig.exceedHandler();
  }

  await rateLimitCounter.inc(key);

  taskExec.exec(() => {
    rateLimitCounter.dec(key);
  }, resolvedConfig.timeSpanMs);

  return originalMethod.apply(target, args);
}

function handleRateLimit<T, D>(
  target: T,
  resolvedConfig: RateLimitConfigs,
  key: string,
  taskExec: TaskExec,
  originalMethod: (...x: any[]) => D,
  args: any[],
): Promise<D> {
  const {rateLimitCounter} = resolvedConfig;
  const currentCount = rateLimitCounter.getCount(key);

  if (currentCount >= resolvedConfig.allowedCalls) {
    resolvedConfig.exceedHandler();
  }

  rateLimitCounter.inc(key);

  taskExec.exec(() => {
    rateLimitCounter.dec(key);
  }, resolvedConfig.timeSpanMs);

  return originalMethod.apply(target, args);
}

export function rateLimit<T = any, D = any>(config: RateLimitConfigs): RateLimitable<T, D> {
  if (config.rateLimitAsyncCounter && config.rateLimitCounter) {
    throw new Error('You cant provide both rateLimitAsyncCounter and rateLimitCounter.');
  }

  const taskExec = new TaskExec();
  const resolvedConfig: RateLimitConfigs = {
    rateLimitCounter: new SimpleRateLimitCounter(),
    exceedHandler: () => {
      throw new Error('You have acceded the amount of allowed calls');
    },
    keyResolver: () => '__rateLimit__',
    ...config,
  };

  return (
    target: T,
    propertyName: keyof T,
    descriptor: TypedPropertyDescriptor<Method<any>>,
  ): TypedPropertyDescriptor<Method<any>> => {
    if (descriptor.value) {
      const originalMethod = descriptor.value;

      descriptor.value = function (...args: any[]): D | Promise<D> {
        const keyResolver: (...x: any[]) => string = typeof resolvedConfig.keyResolver === 'string'
          ? this[resolvedConfig.keyResolver] : (resolvedConfig.keyResolver as (...x: any[]) => any).bind(target);
        const key = keyResolver(...args);

        if (resolvedConfig.rateLimitAsyncCounter) {
          return handleAsyncRateLimit(this, resolvedConfig, key, taskExec, originalMethod, args);
        }

        return handleRateLimit(this, resolvedConfig, key, taskExec, originalMethod, args);
      };

      return descriptor;
    }

    throw new Error('@rateLimit is applicable only on a method.');
  };
}
