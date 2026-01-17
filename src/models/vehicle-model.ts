/**
 * VehicleModel model representing a vehicle model from the Jifeline Networks Partner API.
 * Maps to the Jifeline vehicle model schema.
 */
export interface VehicleModel {
  /** Unique identifier for the vehicle model */
  id: number;
  /** Whether the model is enabled/active */
  enabled: boolean;
  /** Vehicle make ID this model belongs to */
  make_id: number;
  /** Start of manufacturing period (ISO date string), if available */
  manufactured_from?: string | null;
  /** End of manufacturing period (ISO date string), if available */
  manufactured_till?: string | null;
  /** Model group ID */
  model_group_id: number;
  /** Name of the vehicle model */
  name: string;
  /** TecDoc ID, if available */
  tecdoc_id?: string | null;
}

