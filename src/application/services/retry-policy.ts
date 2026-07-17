export interface RetryPolicyConfig {
  readonly maxAttempts: number;
  readonly baseDelayMs: number;
  readonly maxDelayMs: number;
}

export class InvalidRetryPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidRetryPolicyError';
  }
}

export class RetryPolicy {
  private readonly maxAttempts: number;

  private readonly baseDelayMs: number;

  private readonly maxDelayMs: number;

  constructor(config: RetryPolicyConfig) {
    validateConfig(config);
    this.maxAttempts = config.maxAttempts;
    this.baseDelayMs = config.baseDelayMs;
    this.maxDelayMs = config.maxDelayMs;
  }

  shouldRetry(attemptNumber: number): boolean {
    return attemptNumber < this.maxAttempts;
  }

  getDelayMs(attemptNumber: number): number {
    if (attemptNumber < 1) {
      throw new InvalidRetryPolicyError('Attempt number must be greater than zero.');
    }

    const exponentialDelay = this.baseDelayMs * 2 ** (attemptNumber - 1);
    return Math.min(exponentialDelay, this.maxDelayMs);
  }
}

function validateConfig(config: RetryPolicyConfig): void {
  if (config.maxAttempts < 1) {
    throw new InvalidRetryPolicyError('maxAttempts must be greater than zero.');
  }

  if (config.baseDelayMs < 0) {
    throw new InvalidRetryPolicyError('baseDelayMs cannot be negative.');
  }

  if (config.maxDelayMs < config.baseDelayMs) {
    throw new InvalidRetryPolicyError('maxDelayMs must be greater than or equal to baseDelayMs.');
  }
}
