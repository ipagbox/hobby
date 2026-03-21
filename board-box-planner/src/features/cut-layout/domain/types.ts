import type { Board, BoardRole, Project } from '../../../domain/model';

export type ViewMode = 'project' | 'cut';
export type PackingAlgorithm = 'shelf' | 'guillotine' | 'maxrects';

export interface CutPart {
  id: string;
  label: string;
  sourceBoardId: string;
  widthMm: number;
  heightMm: number;
  thicknessMm: number;
  quantity: number;
  rotatable: boolean;
  role: BoardRole;
  material: string;
  color?: string;
  grainDirection?: 'none' | 'x' | 'y';
  edgeBanding?: Partial<Record<'top' | 'right' | 'bottom' | 'left', boolean>>;
  note?: string;
}

export interface CutMaterialGroup {
  id: string;
  label: string;
  material: string;
  thicknessMm: number;
  parts: CutPart[];
}

export interface CutLayoutSettings {
  sheetWidthMm: number;
  sheetHeightMm: number;
  kerfMm: number;
  marginMm: number;
  gapMm: number;
  allowRotation: boolean;
  minimumPartSizeMm: number;
  selectedAlgorithm: PackingAlgorithm;
  autoRecalculate: boolean;
  selectedGroupId: string | null;
}

export interface CutValidationIssue {
  partId: string;
  message: string;
  severity: 'warning' | 'error';
}

export interface PlacedPart {
  partId: string;
  sheetIndex: number;
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
  rotated: boolean;
}

export interface CutSheetLayout {
  index: number;
  widthMm: number;
  heightMm: number;
  usableWidthMm: number;
  usableHeightMm: number;
  placements: PlacedPart[];
  usedAreaMm2: number;
  freeAreaMm2: number;
  utilization: number;
}

export interface CutLayoutSummary {
  totalParts: number;
  placedParts: number;
  unplacedParts: number;
  invalidParts: number;
  usedAreaMm2: number;
  freeAreaMm2: number;
  utilization: number;
  sheetCount: number;
}

export interface CutLayoutResult {
  group: CutMaterialGroup | null;
  sheets: CutSheetLayout[];
  unplacedParts: CutPart[];
  invalidParts: CutPart[];
  issues: CutValidationIssue[];
  summary: CutLayoutSummary;
}

export interface PackingInput {
  parts: CutPart[];
  sheetWidthMm: number;
  sheetHeightMm: number;
  marginMm: number;
  gapMm: number;
  kerfMm: number;
  allowRotation: boolean;
}

export interface PackingAlgorithmModule {
  id: PackingAlgorithm;
  label: string;
  description: string;
  pack(input: PackingInput): CutLayoutResult;
}

export interface CutPartExtractionResult {
  project: Project;
  parts: CutPart[];
  groups: CutMaterialGroup[];
}

export function boardToCutPart(board: Board): CutPart {
  return {
    id: board.id,
    label: board.name,
    sourceBoardId: board.id,
    widthMm: board.width_mm,
    heightMm: board.height_mm,
    thicknessMm: board.thickness_mm,
    quantity: 1,
    rotatable: true,
    role: board.role,
    material: board.material,
    note: board.note,
    grainDirection: 'none',
  };
}
