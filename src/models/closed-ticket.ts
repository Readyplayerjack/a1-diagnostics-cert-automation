/**
 * ClosedTicket model representing a closed diagnostics ticket from the Jifeline Networks Partner API.
 * Maps to the Jifeline closed ticket schema.
 */
export interface ClosedTicket {
  /** Unique identifier for the ticket */
  id: string;
  /** ISO 8601 timestamp when the ticket was created */
  created_at: string;
  /** Customer ID associated with the ticket */
  customer_id: string;
  /** Sequential ticket number */
  ticket_number: number;
  /** Vehicle model ID */
  vehicle_model_id: number;
  /** Vehicle Identification Number */
  vin: string;
  /** ISO 8601 timestamp when the ticket was finished */
  finished_at: string;
  /** ISO 8601 timestamp when the first local entry was added */
  first_local_added_at: string;
  /** Whether the ticket was processed externally */
  externally_processed: boolean;
  /** External reference number */
  external_reference: string | null;
  /** Operator ID assigned to the ticket */
  operator_id: string;
  /** Vehicle battery voltage reading */
  vehicle_battery_voltage: string;
  /** Connection ID associated with the ticket */
  connection_id: string | null;
}

