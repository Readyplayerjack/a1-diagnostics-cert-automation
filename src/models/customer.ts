/**
 * Customer model representing a customer from the Jifeline Networks Partner API.
 * Maps to a subset of the Jifeline customer schema.
 */
export interface Customer {
  /** Unique identifier for the customer */
  id: string;
  /** Company name */
  company_name: string;
  /** Primary location ID, if set */
  primary_location_id: string | null;
  /** Locale code (e.g., 'en-GB') */
  locale: string;
  /** VAT number, if applicable */
  vat_number?: string | null;
  /** Customer reference number */
  reference?: string | null;
}

