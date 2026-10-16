// Minimal project schema types. Task 3 extends this file (openings, items, validation).

export type WallSide = 'north' | 'south' | 'east' | 'west';

export interface MaterialSpec {
  color: string;
}

export interface Room {
  /** Interior size along x (east), mm. */
  width: number;
  /** Interior size along z (north), mm. */
  length: number;
  height: number;
  wallThickness: number;
  floorMaterial: MaterialSpec;
  wallMaterial: MaterialSpec;
}
