/**
 * VehicleMake model representing a vehicle manufacturer from the Jifeline Networks Partner API.
 * Maps to the Jifeline vehicle make schema.
 */
export interface VehicleMake {
  /** Unique identifier for the vehicle make */
  id: number;
  /** Whether the make is enabled/active */
  enabled: boolean;
  /** Name of the vehicle manufacturer */
  name: string;
}

