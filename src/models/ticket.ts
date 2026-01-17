/**
 * Ticket model representing a diagnostics ticket from the Jifeline Networks Partner API.
 * Maps to the Jifeline ticket schema.
 */
export interface Ticket {
  /** Unique identifier for the ticket */
  id: string;
  /** ISO 8601 timestamp when the ticket was assigned */
  assigned_at: string;
  /** ID of the cancellation reason, if cancelled */
  cancel_reason_id: number | null;
  /** Connection ID associated with the ticket */
  connection_id: string | null;
  /** ISO 8601 timestamp when the ticket was created */
  created_at: string;
  /** Customer channel ID */
  customer_channel_id: string | null;
  /** Customer connector ID */
  customer_connector_id: string | null;
  /** Customer ID associated with the ticket */
  customer_id: string | null;
  /** Customer reference number */
  customer_reference: string | null;
  /** External reference number */
  external_reference: string | null;
  /** Whether the ticket was processed externally */
  externally_processed: boolean;
  /** ISO 8601 timestamp when the ticket was finished, or null if not finished */
  finished_at: string | null;
  /** ISO 8601 timestamp when the first local entry was added */
  first_local_added_at: string | null;
  /** Operator channel ID */
  operator_channel_id: string | null;
  /** Operator ID assigned to the ticket */
  operator_id: string | null;
  /** Operator reference number */
  operator_reference: string | null;
  /** Whether the ticket is outsourced */
  outsourced: boolean;
  /** Source provider ID */
  source_provider_id: string;
  /** Current state of the ticket */
  state: 'prepared' | 'pending' | 'in_progress' | 'outsourced' | 'closed' | 'cancelled';
  /** Sequential ticket number */
  ticket_number: number;
  /** ISO 8601 timestamp when the ticket was last updated */
  updated_at: string;
  /** Vehicle model ID */
  vehicle_model_id: number;
  /** Vehicle Identification Number */
  vin: string | null;
  /** Voucher code, if applicable */
  voucher_code: string | null;
}

