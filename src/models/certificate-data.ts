/**
 * CertificateData interface representing the data required to generate
 * a calibration/insurance certificate for a completed diagnostics ticket.
 * This is a domain model that will be populated from Jifeline API data.
 */
export interface CertificateData {
  /** Workshop name (from customer company_name) */
  workshopName: string;
  /** Workshop address as a single formatted line */
  workshopAddress: string;
  /** Operating workshop name, if different (optional) */
  operatingWorkshop?: string | null;
  /** Vehicle manufacturer name */
  vehicleMake: string;
  /** Vehicle model name */
  vehicleModel: string;
  /** Vehicle registration number (optional, Phase 2) */
  vehicleRegistration?: string | null;
  /** Vehicle Identification Number */
  vin?: string | null;
  /** Vehicle mileage at time of service (optional, Phase 2) */
  vehicleMileage?: string | null;
  /** Job number (from ticket_number) */
  jobNumber: number;
  /** Date part of finished_at (ISO date string) */
  date: string;
  /** Time part of finished_at (ISO time string) */
  time: string;
  /** Employee name formatted as "given_name family_name" */
  employeeName: string;
  /** Remote operator name (same as employeeName for now) */
  remoteOperatorName: string;
  /** Calibration tool used (placeholder for future implementation) */
  calibrationToolUsed?: string | null;
  /** System name (placeholder for future implementation) */
  systemName?: string | null;
  /** Calibration result status (e.g., "Calibration Successful") */
  calibrationResult: string;
  /** Pre-scan diagnostic notes (default: "NO DTCs" or "N/A") */
  preScanNotes: string;
  /** Post-scan diagnostic notes (default: "NO DTCs" or "N/A") */
  postScanNotes: string;
}

