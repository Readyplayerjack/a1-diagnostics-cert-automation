import { loadConfig, type Config } from '../config/index.js';
import type {
  Ticket,
  ClosedTicket,
  Customer,
  CustomerLocation,
  Employee,
  VehicleMake,
  VehicleModel,
} from '../models/index.js';
import {
  JifelineApiError,
  JifelineNotFoundError,
  JifelineClientError,
  JifelineServerError,
  JifelineAuthError,
} from './jifeline-api-errors.js';
import { error, warn } from '../services/logger.js';
import { withTimeout, TimeoutError } from '../utils/with-timeout.js';
import { retryWithBackoff, isRetryableError } from '../utils/retry.js';
import { jifelineRateLimiter } from '../utils/rate-limiter.js';

/**
 * OAuth2 token response structure.
 */
interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

/**
 * Cached token with expiry timestamp.
 */
interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

/**
 * Messenger channel message structure from Jifeline API.
 */
interface MessengerChannelMessage {
  id: string;
  content: string;
  type: 'text' | 'attachment';
  created_at: string;
  redacted: boolean;
  sender?: {
    id: string;
    name?: string;
    type?: string;
    [key: string]: unknown;
  };
  attachment?: unknown | null;
}

/**
 * Messenger channel response structure from Jifeline API.
 */
interface MessengerChannelResponse {
  next_token: string | null;
  result: MessengerChannelMessage[];
  channel_id?: string;
  query?: unknown;
}

/**
 * Client for interacting with the Jifeline Networks Partner API.
 * Handles OAuth2 authentication and provides typed methods for API endpoints.
 */
export class JifelineApiClient {
  private readonly config: Config;
  private cachedToken: CachedToken | null = null;

  constructor() {
    this.config = loadConfig();
  }

  /**
   * Fetches an OAuth2 access token using client credentials.
   * Caches the token in memory and refreshes when expired.
   * Protected with timeout and retry logic.
   * @returns A valid access token
   * @throws {JifelineAuthError} If token acquisition fails
   * @throws {TimeoutError} If token acquisition exceeds 10 second timeout
   */
  private async getAccessToken(): Promise<string> {
    // Check if we have a valid cached token
    if (this.cachedToken !== null && Date.now() < this.cachedToken.expiresAt) {
      return this.cachedToken.accessToken;
    }

    // Fetch new token with retry and timeout
    // Flatten promise chain: define async function separately
    const fetchTokenWithTimeout = async (): Promise<string> => {
      // Create promise and await withTimeout on same logical flow
      const tokenPromise = this.fetchAccessToken();
      return await withTimeout(
        tokenPromise,
        10000, // 10 second timeout for token acquisition
        'Jifeline OAuth token acquisition'
      );
    };

    return await retryWithBackoff(fetchTokenWithTimeout, {
      maxRetries: 3,
      initialDelay: 1000,
      maxDelay: 5000,
      operation: 'Jifeline OAuth token acquisition',
      isRetryable: (err) => {
        // Don't retry auth errors (invalid credentials)
        if (err instanceof JifelineAuthError) {
          return false;
        }
        return isRetryableError(err);
      },
    });
  }

  /**
   * Executes the actual token fetch (internal, used by getAccessToken()).
   */
  private async fetchAccessToken(): Promise<string> {
    let response: Response;
    try {
      response = await fetch(this.config.JIFELINE_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: this.config.JIFELINE_CLIENT_ID,
        client_secret: this.config.JIFELINE_CLIENT_SECRET,
      }),
    });

    } catch (error) {
      if (error instanceof JifelineAuthError) {
        throw error;
      }
      // Wrap network/fetch errors
      throw new JifelineAuthError(
        'Failed to acquire access token: network error',
        error instanceof Error ? error.message : String(error)
      );
    }

    if (!response.ok) {
      const errorBody = await response.text().catch(() => 'Unknown error');
      throw new JifelineAuthError(
        `Failed to acquire access token: ${response.status} ${response.statusText}`,
        errorBody
      );
    }

    let tokenData: TokenResponse;
    try {
      tokenData = (await response.json()) as TokenResponse;
    } catch (error) {
      throw new JifelineAuthError(
        'Failed to parse token response',
        error instanceof Error ? error.message : String(error)
      );
    }

    const expiresIn = tokenData.expires_in ?? 3600; // Default to 1 hour if not provided
    // Refresh token 5 minutes before expiry
    const expiresAt = Date.now() + (expiresIn - 300) * 1000;

    this.cachedToken = {
      accessToken: tokenData.access_token,
      expiresAt,
    };

    return this.cachedToken.accessToken;
  }

  /**
   * Centralized request helper that adds Authorization header, parses JSON,
   * and throws typed errors on non-2xx responses.
   * Protected with rate limiting, retry logic, and timeout.
   * @param endpoint API endpoint path (relative to base URL)
   * @returns Parsed JSON response
   * @throws {JifelineNotFoundError} For 404 responses
   * @throws {JifelineClientError} For other 4xx responses
   * @throws {JifelineServerError} For 5xx responses
   * @throws {TimeoutError} If request exceeds 30 second timeout
   */
  private async request<T>(endpoint: string): Promise<T> {
    // Flatten promise chain: define async function separately
    const executeWithTimeout = async (): Promise<T> => {
      // Create promise and await withTimeout on same logical flow
      const requestPromise = this.executeRequest<T>(endpoint);
      return await withTimeout(
        requestPromise,
        30000, // 30 second timeout
        `Jifeline API ${endpoint}`
      );
    };

    const executeWithRetry = async (): Promise<T> => {
      return await retryWithBackoff(executeWithTimeout, {
        maxRetries: 3,
        initialDelay: 1000,
        maxDelay: 10000,
        operation: `Jifeline API ${endpoint}`,
        isRetryable: (err) => {
          // Don't retry 404s
          if (err instanceof JifelineNotFoundError) {
            return false;
          }
          // Retry timeouts and other retryable errors
          return isRetryableError(err);
        },
      });
    };

    return await jifelineRateLimiter.throttle(executeWithRetry);
  }

  /**
   * Executes the actual HTTP request (internal, used by request()).
   */
  private async executeRequest<T>(endpoint: string): Promise<T> {
    const token = await this.getAccessToken();
    const url = `${this.config.JIFELINE_API_BASE_URL}${endpoint}`;

    let response: Response;
    try {
      response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
    } catch (error) {
      // Wrap network/fetch errors
      throw new JifelineApiError(
        `Network error while calling ${endpoint}`,
        0,
        error instanceof Error ? error.message : String(error)
      );
    }

    let responseBody: unknown;
    try {
      responseBody = await response.json();
    } catch {
      responseBody = await response.text().catch(() => 'Unknown error');
    }

    if (!response.ok) {
      // Log API failures without exposing secrets
      const logMeta = {
        endpoint,
        statusCode: response.status,
        statusText: response.statusText,
      };

      if (response.status === 404) {
        warn('Jifeline API resource not found', logMeta);
        throw new JifelineNotFoundError(`Resource not found: ${endpoint}`, responseBody);
      }
      if (response.status >= 400 && response.status < 500) {
        warn('Jifeline API client error', logMeta);
        throw new JifelineClientError(
          `Client error: ${response.status} ${response.statusText}`,
          response.status,
          responseBody
        );
      }
      if (response.status >= 500) {
        error('Jifeline API server error', logMeta);
        throw new JifelineServerError(
          `Server error: ${response.status} ${response.statusText}`,
          response.status,
          responseBody
        );
      }
      error('Jifeline API unexpected error', logMeta);
      throw new JifelineApiError(
        `Unexpected error: ${response.status} ${response.statusText}`,
        response.status,
        responseBody
      );
    }

    return responseBody as T;
  }

  /**
   * Retrieves a ticket by ID.
   * Uses Jifeline endpoint: GET /v2/tickets/tickets/{id}
   * @param ticketId Jifeline ticket UUID
   * @returns Ticket object
   * @throws {JifelineNotFoundError} If ticket is not found
   * @throws {JifelineClientError} For other client errors
   * @throws {JifelineServerError} For server errors
   */
  async getTicketById(ticketId: string): Promise<Ticket> {
    return this.request<Ticket>(`/v2/tickets/tickets/${ticketId}`);
  }

  /**
   * Retrieves a closed ticket by ID.
   * Note: If the Jifeline API does not have a direct "closed ticket by ID" endpoint,
   * this method may need to be implemented differently (e.g., filtering closed tickets).
   * Uses Jifeline endpoint: GET /v2/tickets/tickets/{id} (assuming closed tickets are accessible via the same endpoint)
   * @param ticketId Jifeline ticket UUID
   * @returns ClosedTicket object
   * @throws {JifelineNotFoundError} If ticket is not found
   * @throws {JifelineClientError} For other client errors
   * @throws {JifelineServerError} For server errors
   */
  async getClosedTicketById(ticketId: string): Promise<ClosedTicket> {
    // For now, we'll use the same endpoint and cast to ClosedTicket
    // If the API has a separate endpoint, update this method accordingly
    return this.request<ClosedTicket>(`/v2/tickets/tickets/${ticketId}`);
  }

  /**
   * Retrieves a customer by ID.
   * Uses Jifeline endpoint: GET /v2/customers/{id}
   * @param customerId Jifeline customer UUID
   * @returns Customer object
   * @throws {JifelineNotFoundError} If customer is not found
   * @throws {JifelineClientError} For other client errors
   * @throws {JifelineServerError} For server errors
   */
  async getCustomerById(customerId: string): Promise<Customer> {
    return this.request<Customer>(`/v2/customers/${customerId}`);
  }

  /**
   * Retrieves a customer location by ID.
   * Uses Jifeline endpoint: GET /v2/customers/locations/{location-id}
   * @param locationId Jifeline location UUID
   * @returns CustomerLocation object
   * @throws {JifelineNotFoundError} If location is not found
   * @throws {JifelineClientError} For other client errors
   * @throws {JifelineServerError} For server errors
   */
  async getLocationById(locationId: string): Promise<CustomerLocation> {
    return this.request<CustomerLocation>(`/v2/customers/locations/${locationId}`);
  }

  /**
   * Lists customers with optional filtering.
   * Uses Jifeline endpoint: GET /v2/customers
   * @param options Optional query parameters
   * @param options.enabled Filter by enabled status (true = only active customers)
   * @param options.limit Maximum number of customers to return
   * @returns Array of Customer objects
   * @throws {JifelineClientError} For client errors
   * @throws {JifelineServerError} For server errors
   */
  async listCustomers(options?: {
    enabled?: boolean;
    limit?: number;
  }): Promise<Customer[]> {
    const params = new URLSearchParams();
    if (options?.enabled !== undefined) {
      params.append('enabled', String(options.enabled));
    }
    if (options?.limit !== undefined) {
      params.append('limit', String(options.limit));
    }

    const queryString = params.toString();
    const endpoint = queryString ? `/v2/customers?${queryString}` : '/v2/customers';

    // API may return paginated response with 'data' array or direct array
    const response = await this.request<{ data?: Customer[] } | Customer[]>(endpoint);
    if (Array.isArray(response)) {
      return response;
    }
    if (response.data && Array.isArray(response.data)) {
      return response.data;
    }
    return [];
  }

  /**
   * Retrieves an employee by ID.
   * Uses Jifeline endpoint: GET /v2/customers/employees/{employee-id}
   * @param employeeId Jifeline employee UUID
   * @returns Employee object
   * @throws {JifelineNotFoundError} If employee is not found
   * @throws {JifelineClientError} For other client errors
   * @throws {JifelineServerError} For server errors
   */
  async getEmployeeById(employeeId: string): Promise<Employee> {
    return this.request<Employee>(`/v2/customers/employees/${employeeId}`);
  }

  /**
   * Retrieves a vehicle model by ID.
   * Uses Jifeline endpoint: GET /v2/vehicles/models/{model-id}
   * @param modelId Vehicle model ID
   * @returns VehicleModel object
   * @throws {JifelineNotFoundError} If model is not found
   * @throws {JifelineClientError} For other client errors
   * @throws {JifelineServerError} For server errors
   */
  async getVehicleModelById(modelId: number): Promise<VehicleModel> {
    return this.request<VehicleModel>(`/v2/vehicles/models/${modelId}`);
  }

  /**
   * Retrieves a vehicle make by ID.
   * Uses Jifeline endpoint: GET /v2/vehicles/makes/{make-id}
   * @param makeId Vehicle make ID
   * @returns VehicleMake object
   * @throws {JifelineNotFoundError} If make is not found
   * @throws {JifelineClientError} For other client errors
   * @throws {JifelineServerError} For server errors
   */
  async getVehicleMakeById(makeId: number): Promise<VehicleMake> {
    return this.request<VehicleMake>(`/v2/vehicles/makes/${makeId}`);
  }

  /**
   * Lists tickets with optional filtering and pagination.
   * Uses Jifeline endpoint: GET /v2/tickets/tickets
   * @param options Optional query parameters
   * @param options.limit Maximum number of tickets to return (default: 10)
   * @param options.state Filter by ticket state (e.g., 'closed', 'in_progress')
   * @param options.externally_processed Filter by externally processed flag
   * @param options.ticket_number Filter by specific ticket number
   * @returns Array of Ticket objects
   * @throws {JifelineClientError} For client errors
   * @throws {JifelineServerError} For server errors
   */
  async listTickets(options?: {
    limit?: number;
    state?: Ticket['state'];
    externally_processed?: boolean;
    ticket_number?: number;
  }): Promise<Ticket[]> {
    const params = new URLSearchParams();
    if (options?.limit !== undefined) {
      params.append('limit', String(options.limit));
    }
    if (options?.state !== undefined) {
      params.append('state', options.state);
    }
    if (options?.externally_processed !== undefined) {
      params.append('externally_processed', String(options.externally_processed));
    }
    if (options?.ticket_number !== undefined) {
      params.append('ticket_number', String(options.ticket_number));
    }

    // Always use the general tickets endpoint with query parameters
    const queryString = params.toString();
    const endpoint = queryString ? `/v2/tickets/tickets?${queryString}` : '/v2/tickets/tickets';

    // API may return paginated response with 'data' array or direct array
    const response = await this.request<{ data?: Ticket[] } | Ticket[]>(endpoint);
    if (Array.isArray(response)) {
      return response;
    }
    if (response.data && Array.isArray(response.data)) {
      return response.data;
    }
    return [];
  }

  /**
   * Fetches ticket conversation text from Jifeline messenger channel.
   *
   * This is a two-step process:
   * 1. Get the ticket to extract customer_channel_id
   * 2. Fetch messages from the messenger channel using that channel ID
   *
   * @param ticketId Jifeline ticket UUID
   * @returns Combined conversation text from all messages, or null if no channel/messages available
   * @throws {JifelineNotFoundError} If ticket is not found
   * @throws {JifelineClientError} For client errors (4xx)
   * @throws {JifelineServerError} For server errors (5xx)
   */
  async getTicketConversationText(ticketId: string): Promise<string | null> {
    // Step 1: Get the ticket to extract customer_channel_id
    let ticket: Ticket;
    try {
      ticket = await this.getTicketById(ticketId);
    } catch (error) {
      // Re-throw Jifeline API errors (NotFound, ClientError, ServerError)
      // These are system failures that should propagate
      throw error;
    }

    // Handle missing channel ID - return null (expected for tickets in 'prepared' state or without conversations)
    if (!ticket.customer_channel_id) {
      return null;
    }

    // Step 2: Fetch messages from the messenger channel
    // Endpoint: GET /v2/tickets/messenger_channels/{channel_id}
    // Query param: channel_id={customer_channel_id} (required)
    const channelId = ticket.customer_channel_id;
    const messages: MessengerChannelMessage[] = [];
    let nextToken: string | null = null;

    // Paginate through all messages
    do {
      const params = new URLSearchParams();
      // According to Jifeline docs, both the path parameter and the
      // query parameter `channel_id` are required.
      params.append('channel_id', channelId);
      if (nextToken) {
        params.append('next_token', nextToken);
      }

      // Endpoint format from Jifeline Partner API docs:
      // GET /v2/tickets/messenger_channels/{channel_id}?channel_id={channel_id}
      const endpoint = `/v2/tickets/messenger_channels/${channelId}?${params.toString()}`;

      let response: MessengerChannelResponse;
      try {
        response = await this.request<MessengerChannelResponse>(endpoint);
      } catch (error) {
        // If channel not found (404), return null (no messages available)
        // This is expected for tickets without messenger conversations
        if (error instanceof JifelineNotFoundError) {
          return null;
        }
        // Re-throw other errors (auth, server errors, etc.) as system failures
        throw error;
      }

      // Extract messages from response
      if (response.result && Array.isArray(response.result)) {
        messages.push(...response.result);
      }

      // Check for next page
      nextToken = response.next_token ?? null;
    } while (nextToken);

    // Step 3: Filter and process messages
    // Filter: Only include messages where type === 'text' and redacted === false
    // Sort: By created_at in chronological order (oldest first)
    const textMessages = messages
      .filter((msg) => msg.type === 'text' && !msg.redacted)
      .sort((a, b) => {
        const dateA = new Date(a.created_at).getTime();
        const dateB = new Date(b.created_at).getTime();
        return dateA - dateB;
      });

    // Handle empty results - return null if no text messages found
    if (textMessages.length === 0) {
      return null;
    }

    // Step 4: Concatenate message content
    // Extract content field from each message and join with single newline
    // TODO: Consider whitespace normalization (save full sanitization for extractor's normalization step)
    const conversationText = textMessages
      .map((msg) => msg.content)
      .join('\n')
      .replace(/\n{3,}/g, '\n\n') // Normalize multiple consecutive newlines to max 2
      .trim(); // Remove leading/trailing whitespace

    return conversationText || null;
  }
}
