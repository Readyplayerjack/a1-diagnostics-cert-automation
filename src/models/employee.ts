/**
 * Employee model representing an employee from the Jifeline Networks Partner API.
 * Maps to the Jifeline employee schema.
 */
export interface Employee {
  /** Unique identifier for the employee */
  id: string;
  /** Contact point ID, if available */
  contact_point_id: string | null;
  /** Correspondence locale code (e.g., 'en-GB') */
  correspondence_locale: string;
  /** Customer ID this employee belongs to */
  customer_id: string;
  /** Whether the employee is enabled/active */
  enabled: boolean;
  /** Employee's family name (surname) */
  family_name: string;
  /** Employee's given name (first name) */
  given_name: string;
  /** Username, if set */
  username: string | null;
}

