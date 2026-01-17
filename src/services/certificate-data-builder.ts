import type { CertificateData } from '../models/certificate-data.js';
import type {
  Ticket,
  Customer,
  CustomerLocation,
  Employee,
  VehicleModel,
  VehicleMake,
} from '../models/index.js';
import { JifelineApiClient } from '../clients/jifeline-api-client.js';
import { JifelineNotFoundError } from '../clients/jifeline-api-errors.js';
import type { RegMileageExtractor } from './reg-mileage-extractor.js';
import { info, warn } from './logger.js';

/**
 * Error codes for certificate data building failures.
 */
export enum CertificateDataErrorCode {
  TICKET_NOT_FOUND = 'TICKET_NOT_FOUND',
  CUSTOMER_NOT_FOUND = 'CUSTOMER_NOT_FOUND',
  MISSING_CUSTOMER_ID = 'MISSING_CUSTOMER_ID',
  MISSING_VEHICLE_MODEL_ID = 'MISSING_VEHICLE_MODEL_ID',
  MISSING_PRIMARY_LOCATION = 'MISSING_PRIMARY_LOCATION',
  LOCATION_NOT_FOUND = 'LOCATION_NOT_FOUND',
  MISSING_FINISHED_AT = 'MISSING_FINISHED_AT',
  OPERATOR_NOT_FOUND = 'OPERATOR_NOT_FOUND',
  VEHICLE_MODEL_NOT_FOUND = 'VEHICLE_MODEL_NOT_FOUND',
  VEHICLE_MAKE_NOT_FOUND = 'VEHICLE_MAKE_NOT_FOUND',
}

/**
 * Structured error for certificate data building failures.
 */
export class CertificateDataError extends Error {
  public readonly code: CertificateDataErrorCode;

  constructor(code: CertificateDataErrorCode, message: string) {
    super(message);
    this.name = 'CertificateDataError';
    this.code = code;
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, CertificateDataError);
    }
  }
}

/**
 * Service that builds CertificateData from Jifeline API entities.
 *
 * This service loads the following entities:
 * - Ticket (primary source)
 * - Customer (via customer_id)
 * - CustomerLocation (via Customer.primary_location_id)
 * - Employee (via operator_id)
 * - VehicleModel (via vehicle_model_id)
 * - VehicleMake (via VehicleModel.make_id)
 *
 * Critical fields (will throw CertificateDataError if missing):
 * - Ticket must exist and have vehicle_model_id, finished_at
 * - VehicleModel and VehicleMake must exist
 *
 * Optional fields (use fallbacks if unavailable):
 * - Customer data: Uses "Unknown workshop" if customer endpoint returns 404 or is inaccessible
 * - Location data: Uses "Address not available" if location is missing or inaccessible
 * - Employee: Uses "Unknown Operator" if employee endpoint returns 404 or operator_id is missing
 *
 * Non-critical fields (left empty if missing):
 * - vehicleRegistration (extracted from conversation via RegMileageExtractor)
 * - vehicleMileage (extracted from conversation via RegMileageExtractor)
 * - calibrationToolUsed (future phase)
 * - systemName (future phase)
 */
export class CertificateDataBuilder {
  private readonly apiClient: JifelineApiClient;
  private readonly regMileageExtractor: RegMileageExtractor;

  constructor(apiClient: JifelineApiClient, regMileageExtractor: RegMileageExtractor) {
    this.apiClient = apiClient;
    this.regMileageExtractor = regMileageExtractor;
  }

  /**
   * Builds CertificateData for a given ticket ID.
   * @param ticketId Jifeline ticket UUID
   * @returns CertificateData object
   * @throws {CertificateDataError} If any critical data is missing
   * @throws {JifelineNotFoundError} If ticket or related entities are not found
   */
  async buildForTicket(ticketId: string): Promise<CertificateData> {
    // Load ticket
    let ticket: Ticket;
    try {
      ticket = await this.apiClient.getTicketById(ticketId);
    } catch (error) {
      if (error instanceof JifelineNotFoundError) {
        throw new CertificateDataError(
          CertificateDataErrorCode.TICKET_NOT_FOUND,
          `Ticket not found: ${ticketId}`
        );
      }
      throw error;
    }

    // Validate critical ticket fields
    // Note: customer_id is no longer required - we'll use fallback if missing
    if (!ticket.vehicle_model_id) {
      const errorCode = CertificateDataErrorCode.MISSING_VEHICLE_MODEL_ID;
      warn('Missing vehicle_model_id in ticket', { ticketId, errorCode });
      throw new CertificateDataError(errorCode, `Ticket ${ticketId} has no vehicle_model_id`);
    }

    if (!ticket.finished_at) {
      const errorCode = CertificateDataErrorCode.MISSING_FINISHED_AT;
      warn('Missing finished_at in ticket', { ticketId, errorCode });
      throw new CertificateDataError(errorCode, `Ticket ${ticketId} has no finished_at timestamp`);
    }

    // Load related entities in parallel
    // Customer is optional - if not accessible, use fallback values
    const customerId = ticket.customer_id;
    const [customerResult, vehicleModel] = await Promise.all([
      customerId ? this.loadCustomerSafe(customerId) : Promise.resolve({ customer: null, accessible: false }),
      this.loadVehicleModel(ticket.vehicle_model_id),
    ]);

    const customer = customerResult.customer;
    const customerAccessible = customerResult.accessible;

    // Load location if customer is accessible and has primary_location_id
    let location: CustomerLocation | null = null;
    if (customerAccessible && customer && customer.primary_location_id) {
      try {
        location = await this.loadLocation(customer.primary_location_id);
      } catch (err) {
        // Handle 404 and other errors gracefully - use fallback address
        if (err instanceof CertificateDataError && err.code === CertificateDataErrorCode.LOCATION_NOT_FOUND) {
          warn('Location not accessible, using fallback address', {
            ticketId,
            locationId: customer.primary_location_id,
          });
          location = null;
        } else if (err instanceof JifelineNotFoundError) {
          warn('Location not accessible (404), using fallback address', {
            ticketId,
            locationId: customer.primary_location_id,
          });
          location = null;
        } else {
          // For other errors (network, 5xx), log but continue with fallback
          warn('Location fetch failed, using fallback address', {
            ticketId,
            locationId: customer.primary_location_id,
            errorMessage: err instanceof Error ? err.message : String(err),
          });
          location = null;
        }
      }
    } else if (customerId && !customerAccessible) {
      warn('Customer not accessible, skipping location fetch', {
        ticketId,
        customerId,
      });
    }

    // Load vehicle make
    const vehicleMake = await this.loadVehicleMake(vehicleModel.make_id);

    // Load employee if operator_id is present (optional - use fallback if not accessible)
    let employee: Employee | null = null;
    let employeeName = 'Unknown Operator';
    
    if (ticket.operator_id) {
      try {
        employee = await this.loadEmployee(ticket.operator_id);
        employeeName = `${employee.given_name} ${employee.family_name}`.trim();
      } catch (err) {
        // Handle 404 and other errors gracefully - use fallback name
        if (err instanceof CertificateDataError && err.code === CertificateDataErrorCode.OPERATOR_NOT_FOUND) {
          warn('Employee not accessible, using fallback name', {
            ticketId,
            employeeId: ticket.operator_id,
          });
        } else if (err instanceof JifelineNotFoundError) {
          warn('Employee not accessible (404), using fallback name', {
            ticketId,
            employeeId: ticket.operator_id,
          });
        } else {
          // For other errors (network, 5xx), log but continue with fallback
          warn('Employee fetch failed, using fallback name', {
            ticketId,
            employeeId: ticket.operator_id,
            errorMessage: err instanceof Error ? err.message : String(err),
          });
        }
        // employeeName already set to fallback
      }
    } else {
      warn('Missing operator_id in ticket, using fallback name', { ticketId });
    }

    // Parse finished_at timestamp
    const finishedAtDate = new Date(ticket.finished_at);
    const date = finishedAtDate.toISOString().split('T')[0] ?? ''; // YYYY-MM-DD
    const time = finishedAtDate.toTimeString().split(' ')[0] ?? ''; // HH:mm:ss

    // Build workshop address as single line: "street_name number, postal_code city, country"
    // Use fallback if location is not available
    let workshopAddress: string;
    if (location) {
      const streetAndNumber = `${location.street_name} ${location.number}`;
      const postalAndCity = `${location.postal_code} ${location.city}`;
      workshopAddress = location.country
        ? `${streetAndNumber}, ${postalAndCity}, ${location.country}`
        : `${streetAndNumber}, ${postalAndCity}`;
    } else {
      workshopAddress = 'Address not available';
    }


    // Extract vehicle registration and mileage from conversation
    // Non-critical: if extraction fails, proceed with null values
    let vehicleRegistration: string | null = null;
    let vehicleMileage: string | null = null;
    try {
      const extractionResult = await this.regMileageExtractor.extract({
        ticketId,
        ticketNumber: ticket.ticket_number,
        // conversationText is undefined - extractor will fetch from API if needed
      });

      vehicleRegistration = extractionResult.vehicleRegistration;
      vehicleMileage = extractionResult.vehicleMileage;

      // Log extraction results for observability
      if (extractionResult.errors.length > 0) {
        const errorCodes = extractionResult.errors.map((err) => err.code).join(', ');
        warn('Registration/mileage extraction completed with warnings', {
          ticketId,
          ticketNumber: ticket.ticket_number,
          registrationConfidence: extractionResult.registrationConfidence,
          mileageConfidence: extractionResult.mileageConfidence,
          errorCodes,
        });
      } else if (vehicleRegistration || vehicleMileage) {
        // Log successful extraction
        info('Registration/mileage extraction succeeded', {
          ticketId,
          ticketNumber: ticket.ticket_number,
          hasRegistration: !!vehicleRegistration,
          hasMileage: !!vehicleMileage,
          registrationConfidence: extractionResult.registrationConfidence,
          mileageConfidence: extractionResult.mileageConfidence,
        });
      }
    } catch (err) {
      // System/infrastructure error during extraction - log and proceed with null values
      // This is non-critical, so we don't throw or fail the entire build
      warn('Registration/mileage extraction failed with system error', {
        ticketId,
        ticketNumber: ticket.ticket_number,
        errorMessage: err instanceof Error ? err.message : 'Unknown error',
      });
    }

    // Build CertificateData
    // Use fallback workshop name if customer is not accessible
    const workshopName = customerAccessible && customer
      ? customer.company_name
      : 'Unknown workshop';

    return {
      workshopName,
      workshopAddress,
      operatingWorkshop: workshopAddress,
      vehicleMake: vehicleMake.name,
      vehicleModel: vehicleModel.name,
      vin: ticket.vin ?? null,
      jobNumber: ticket.ticket_number,
      date,
      time,
      employeeName,
      remoteOperatorName: employeeName,
      calibrationResult: 'Calibration Successful',
      preScanNotes: 'NO DTCs',
      postScanNotes: 'NO DTCs',
      vehicleRegistration,
      vehicleMileage,
      calibrationToolUsed: null,
      systemName: null,
    };
  }

  /**
   * Loads a customer safely, returning null if not accessible (404 or other non-2xx).
   * This allows the pipeline to continue with fallback values when customer data is unavailable.
   * @returns Object with customer data and accessibility status
   */
  private async loadCustomerSafe(
    customerId: string
  ): Promise<{ customer: Customer | null; accessible: boolean }> {
    try {
      const customer = await this.apiClient.getCustomerById(customerId);
      return { customer, accessible: true };
    } catch (err) {
      // Handle 404 and other non-2xx errors gracefully
      if (err instanceof JifelineNotFoundError) {
        warn(`Customer ${customerId} not accessible (404), using fallback data`, {
          customerId,
          ticketId: 'unknown', // Will be logged at higher level
        });
        return { customer: null, accessible: false };
      }
      // For other errors (network, 5xx, etc.), log but still use fallback
      // This ensures the pipeline doesn't crash on transient API issues
      warn(`Customer ${customerId} fetch failed, using fallback data`, {
        customerId,
        errorMessage: err instanceof Error ? err.message : String(err),
      });
      return { customer: null, accessible: false };
    }
  }

  /**
   * Loads a location, throwing CertificateDataError if not found.
   */
  private async loadLocation(locationId: string): Promise<CustomerLocation> {
    try {
      return await this.apiClient.getLocationById(locationId);
    } catch (err) {
      if (err instanceof JifelineNotFoundError) {
        const errorCode = CertificateDataErrorCode.LOCATION_NOT_FOUND;
        warn('Location not found', { locationId, errorCode });
        throw new CertificateDataError(errorCode, `Location not found: ${locationId}`);
      }
      throw err;
    }
  }

  /**
   * Loads an employee, throwing CertificateDataError if not found.
   */
  private async loadEmployee(employeeId: string): Promise<Employee> {
    try {
      return await this.apiClient.getEmployeeById(employeeId);
    } catch (err) {
      if (err instanceof JifelineNotFoundError) {
        const errorCode = CertificateDataErrorCode.OPERATOR_NOT_FOUND;
        warn('Employee not found', { employeeId, errorCode });
        throw new CertificateDataError(errorCode, `Employee not found: ${employeeId}`);
      }
      throw err;
    }
  }

  /**
   * Loads a vehicle model, throwing CertificateDataError if not found.
   */
  private async loadVehicleModel(modelId: number): Promise<VehicleModel> {
    try {
      return await this.apiClient.getVehicleModelById(modelId);
    } catch (err) {
      if (err instanceof JifelineNotFoundError) {
        const errorCode = CertificateDataErrorCode.VEHICLE_MODEL_NOT_FOUND;
        warn('Vehicle model not found', { modelId, errorCode });
        throw new CertificateDataError(errorCode, `Vehicle model not found: ${modelId}`);
      }
      throw err;
    }
  }

  /**
   * Loads a vehicle make, throwing CertificateDataError if not found.
   */
  private async loadVehicleMake(makeId: number): Promise<VehicleMake> {
    try {
      return await this.apiClient.getVehicleMakeById(makeId);
    } catch (err) {
      if (err instanceof JifelineNotFoundError) {
        const errorCode = CertificateDataErrorCode.VEHICLE_MAKE_NOT_FOUND;
        warn('Vehicle make not found', { makeId, errorCode });
        throw new CertificateDataError(errorCode, `Vehicle make not found: ${makeId}`);
      }
      throw err;
    }
  }
}
