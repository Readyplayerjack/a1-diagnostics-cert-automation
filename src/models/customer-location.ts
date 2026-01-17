/**
 * CustomerLocation model representing a customer location/address from the Jifeline Networks Partner API.
 * Maps to the Jifeline customer location schema.
 */
export interface CustomerLocation {
  /** Unique identifier for the location */
  id: string;
  /** City name */
  city: string;
  /** Country code, if available */
  country: string | null;
  /** Customer ID this location belongs to */
  customer_id: string;
  /** Location label/name */
  label: string;
  /** Street/house number */
  number: string;
  /** Postal/ZIP code */
  postal_code: string;
  /** Street name */
  street_name: string;
}

