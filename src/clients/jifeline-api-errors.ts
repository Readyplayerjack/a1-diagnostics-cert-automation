/**
 * Base error class for Jifeline API errors.
 */
export class JifelineApiError extends Error {
  public readonly statusCode: number;
  public readonly responseBody: unknown;

  constructor(message: string, statusCode: number, responseBody: unknown) {
    super(message);
    this.name = 'JifelineApiError';
    this.statusCode = statusCode;
    this.responseBody = responseBody;
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, JifelineApiError);
    }
  }
}

/**
 * Error thrown when a resource is not found (404).
 */
export class JifelineNotFoundError extends JifelineApiError {
  constructor(message: string, responseBody: unknown) {
    super(message, 404, responseBody);
    this.name = 'JifelineNotFoundError';
  }
}

/**
 * Error thrown for client errors (4xx, excluding 404).
 */
export class JifelineClientError extends JifelineApiError {
  constructor(message: string, statusCode: number, responseBody: unknown) {
    super(message, statusCode, responseBody);
    this.name = 'JifelineClientError';
  }
}

/**
 * Error thrown for server errors (5xx).
 */
export class JifelineServerError extends JifelineApiError {
  constructor(message: string, statusCode: number, responseBody: unknown) {
    super(message, statusCode, responseBody);
    this.name = 'JifelineServerError';
  }
}

/**
 * Error thrown when OAuth2 token acquisition fails.
 */
export class JifelineAuthError extends Error {
  public readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'JifelineAuthError';
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, JifelineAuthError);
    }
    if (cause) {
      this.cause = cause;
    }
  }
}

