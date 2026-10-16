// Project and catalog types (SPEC §5). All lengths are millimetres, angles are degrees.

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

export interface Opening {
  id: string;
  type: 'door' | 'window';
  wall: WallSide;
  /** Distance from the wall's left corner as seen from inside the room. */
  offset: number;
  width: number;
  height: number;
  /** Height of the opening's lower edge above the floor. */
  sill: number;
}

export interface Socket {
  id: string;
  wall: WallSide;
  offset: number;
  height: number;
}

export interface Size3 {
  w: number;
  h: number;
  d: number;
}

export interface FurnitureItem {
  id: string;
  catalogId: string;
  /** Centre of the item's base on the floor plan. */
  position: { x: number; z: number };
  rotationY: number;
  size: Size3;
  color: string;
}

export interface EstimateItem {
  id: string;
  category: string;
  name: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  note: string;
}

export interface Project {
  version: 1;
  name: string;
  room: Room;
  openings: Opening[];
  sockets: Socket[];
  furniture: FurnitureItem[];
  estimate: EstimateItem[];
}

export interface CatalogEntry {
  id: string;
  name: string;
  category: string;
  /** Path to a GLB model; empty means "draw a box by size". */
  model: string;
  defaultSize: Size3;
  source: string;
  license: string;
}
