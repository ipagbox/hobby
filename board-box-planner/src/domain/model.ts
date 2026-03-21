export const DEFAULT_BOARD_THICKNESS_MM = 16;
export const SNAP_STEPS_MM = [1, 5, 10] as const;

export type Orientation = 'XY' | 'XZ' | 'YZ';
export type BoardRole =
  | 'side'
  | 'top'
  | 'bottom'
  | 'back'
  | 'shelf'
  | 'divider_vertical'
  | 'divider_horizontal'
  | 'front'
  | 'door'
  | 'custom';

export interface AppSettings {
  gridVisible: boolean;
  snapEnabled: boolean;
  snapStepMm: (typeof SNAP_STEPS_MM)[number];
  transparencyEnabled: boolean;
}

export interface Board {
  id: string;
  name: string;
  role: BoardRole;
  material: string;
  width_mm: number;
  height_mm: number;
  thickness_mm: number;
  x_mm: number;
  y_mm: number;
  z_mm: number;
  orientation: Orientation;
  note: string;
}

export interface Project {
  name: string;
  board_thickness_mm: number;
  boards: Board[];
  settings: AppSettings;
}

export const ROLE_OPTIONS: BoardRole[] = [
  'side',
  'top',
  'bottom',
  'back',
  'shelf',
  'divider_vertical',
  'divider_horizontal',
  'front',
  'door',
  'custom',
];

export const ORIENTATION_OPTIONS: Orientation[] = ['XY', 'XZ', 'YZ'];

export function createBoardId(): string {
  return `board_${Math.random().toString(36).slice(2, 10)}`;
}

export function createBoard(partial: Partial<Board> = {}, globalThickness = DEFAULT_BOARD_THICKNESS_MM): Board {
  return {
    id: partial.id ?? createBoardId(),
    name: partial.name ?? 'Board',
    role: partial.role ?? 'custom',
    material: partial.material ?? 'Birch plywood',
    width_mm: partial.width_mm ?? 600,
    height_mm: partial.height_mm ?? 400,
    thickness_mm: partial.thickness_mm ?? globalThickness,
    x_mm: partial.x_mm ?? 0,
    y_mm: partial.y_mm ?? 0,
    z_mm: partial.z_mm ?? 0,
    orientation: partial.orientation ?? 'YZ',
    note: partial.note ?? '',
  };
}

export function createEmptyProject(): Project {
  return {
    name: 'Untitled project',
    board_thickness_mm: DEFAULT_BOARD_THICKNESS_MM,
    boards: [createBoard({ name: 'Side panel', role: 'side', orientation: 'YZ', x_mm: 0, y_mm: 300, z_mm: 200 })],
    settings: {
      gridVisible: true,
      snapEnabled: true,
      snapStepMm: 10,
      transparencyEnabled: false,
    },
  };
}

export function boardSizeVector(board: Board): [number, number, number] {
  switch (board.orientation) {
    case 'XY':
      return [board.width_mm, board.height_mm, board.thickness_mm];
    case 'XZ':
      return [board.width_mm, board.thickness_mm, board.height_mm];
    case 'YZ':
      return [board.thickness_mm, board.height_mm, board.width_mm];
  }
}

export function projectFromJson(raw: string): Project {
  const parsed = JSON.parse(raw) as Partial<Project>;
  const thickness = parsed.board_thickness_mm ?? DEFAULT_BOARD_THICKNESS_MM;
  return {
    name: parsed.name ?? 'Imported project',
    board_thickness_mm: thickness,
    boards: (parsed.boards ?? []).map((board, index) =>
      createBoard(
        {
          ...board,
          id: board?.id ?? `imported_${index}`,
          thickness_mm: board?.thickness_mm ?? thickness,
        },
        thickness,
      ),
    ),
    settings: {
      gridVisible: parsed.settings?.gridVisible ?? true,
      snapEnabled: parsed.settings?.snapEnabled ?? true,
      snapStepMm: SNAP_STEPS_MM.includes(parsed.settings?.snapStepMm as (typeof SNAP_STEPS_MM)[number])
        ? (parsed.settings?.snapStepMm as (typeof SNAP_STEPS_MM)[number])
        : 10,
      transparencyEnabled: parsed.settings?.transparencyEnabled ?? false,
    },
  };
}

export function projectToJson(project: Project): string {
  return JSON.stringify(project, null, 2);
}
