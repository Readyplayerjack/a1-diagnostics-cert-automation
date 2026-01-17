/**
 * Jifeline Events API Poller
 *
 * Polls the Jifeline Events API for tickets.ticket.closed events
 * to discover ticket UUIDs that need certificate processing.
 */

import { JifelineApiClient } from './jifeline-api-client.js';
import {
  JifelineApiError,
  JifelineNotFoundError,
  JifelineClientError,
  JifelineServerError,
} from './jifeline-api-errors.js';

/**
 * Ticket closed event structure from Jifeline Events API.
 */
export interface TicketClosedEvent {
  /** Event ULID */
  id: string;
  /** Event type */
  type: 'tickets.ticket.closed';
  /** ISO 8601 timestamp when event occurred */
  occurred_at: string;
  /** Event payload containing ticket and related data */
  payload: {
    ticket: {
      /** Ticket UUID - this is what we need! */
      id: string;
      /** Ticket number */
      ticket_number: number;
      /** Ticket state (should be 'closed') */
      state: 'closed';
      /** Whether ticket was externally processed */
      externally_processed: boolean;
      /** ISO 8601 timestamp when ticket was finished */
      finished_at: string | null;
      /** Customer ID */
      customer_id: string | null;
      /** Operator ID */
      operator_id: string | null;
      /** Vehicle model ID */
      vehicle_model_id: number;
      /** Other ticket fields may be present */
      [key: string]: unknown;
    };
    customer?: {
      id: string;
      [key: string]: unknown;
    };
    vehicle?: {
      id: string;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
}

/**
 * Events API response structure.
 */
interface EventsApiResponse {
  /** Pagination token for next page */
  after_id?: string | null;
  /** Array of events */
  result: TicketClosedEvent[];
}

/**
 * Options for polling closed tickets.
 */
export interface PollClosedTicketsOptions {
  /** Only return tickets that haven't been externally processed */
  unprocessed_only?: boolean;
  /** Maximum number of events to fetch per page */
  limit?: number;
}

/**
 * Client for polling Jifeline Events API for ticket closed events.
 *
 * Uses the Events API to discover closed tickets that need certificate processing.
 * This bypasses the list tickets endpoint limitations.
 */
export class JifelineEventsPoller {
  private readonly apiClient: JifelineApiClient;

  constructor(apiClient?: JifelineApiClient) {
    this.apiClient = apiClient ?? new JifelineApiClient();
  }

  /**
   * Polls the Events API for tickets.ticket.closed events.
   *
   * @param since Optional date to fetch events after (defaults to 24 hours ago)
   * @param options Optional polling options
   * @returns Array of ticket UUIDs from closed ticket events
   * @throws {JifelineClientError} For client errors (4xx)
   * @throws {JifelineServerError} For server errors (5xx)
   */
  async pollClosedTickets(
    since?: Date,
    options: PollClosedTicketsOptions = {}
  ): Promise<string[]> {
    const { unprocessed_only = false, limit = 100 } = options;

    // Default to 24 hours ago if no since date provided
    const sinceDate = since ?? new Date(Date.now() - 24 * 60 * 60 * 1000);
    const occurredAfter = sinceDate.toISOString();

    const ticketIds: string[] = [];
    let afterId: string | null = null;
    let hasMore = true;

    // Paginate through all events
    // Note: API only allows one filter parameter per request
    // We'll use 'type' filter and handle date filtering client-side if needed
    while (hasMore) {
      const params = new URLSearchParams();
      params.append('type', 'tickets.ticket.closed');
      params.append('limit', String(limit));
      if (afterId) {
        params.append('after_id', afterId);
      }
      // Note: occurred_after cannot be used with type filter
      // We'll filter by date client-side after fetching

      const endpoint = `/v2/system/events?${params.toString()}`;

      let response: EventsApiResponse;
      try {
        // Use the JifelineApiClient's request method via a workaround
        // Since request is private, we'll need to make the API call directly
        // or expose a method. For now, let's use fetch directly with OAuth token.
        response = await this.fetchEvents(endpoint);
      } catch (error) {
        // If no events found (404), return empty array
        if (error instanceof JifelineNotFoundError) {
          return [];
        }
        // Re-throw other errors
        throw error;
      }

      // Extract ticket UUIDs from events
      for (const event of response.result) {
        if (event.type === 'tickets.ticket.closed' && event.payload?.ticket?.id) {
          const ticket = event.payload.ticket;

          // Filter by date if since date provided
          if (since) {
            const eventDate = new Date(event.occurred_at);
            if (eventDate < sinceDate) {
              // Event is before since date, stop pagination
              hasMore = false;
              break;
            }
          }

          // Filter for unprocessed tickets if requested
          if (unprocessed_only && ticket.externally_processed === true) {
            continue;
          }

          ticketIds.push(ticket.id);
        }
      }

      // Check for next page
      afterId = response.after_id ?? null;
      hasMore = afterId !== null && response.result.length > 0;
    }

    // Remove duplicates (in case of overlapping time ranges)
    return Array.from(new Set(ticketIds));
  }

  /**
   * Fetches events from the Events API endpoint.
   * Uses JifelineApiClient's request method via type assertion.
   */
  private async fetchEvents(endpoint: string): Promise<EventsApiResponse> {
    // Use the API client's request method via type assertion
    // The request method is private but we can access it this way
    return (this.apiClient as unknown as { request<T>(endpoint: string): Promise<T> }).request<
      EventsApiResponse
    >(endpoint);
  }
}

