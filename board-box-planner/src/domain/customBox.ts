import { createBoard, type Board } from './model';

export type AssemblyMode = 'sides_over' | 'top_bottom_over';
export type BackWallMode = 'inside' | 'overlay';

export interface CustomBoxConfig {
  widthMm: number;
  heightMm: number;
  depthMm: number;
  walls: {
    left: boolean;
    right: boolean;
    top: boolean;
    bottom: boolean;
    back: boolean;
  };
  assemblyMode: AssemblyMode;
  mainThicknessMm: number;
  backThicknessMm: number;
  backWallMode: BackWallMode;
  backWallInsetMm: number;
  doors: {
    enabled: boolean;
    count: 1 | 2;
    verticalGapMm: number;
    horizontalGapMm: number;
  };
}

export interface CustomBoxValidation {
  isValid: boolean;
  errors: Partial<Record<string, string>>;
}

export interface CustomBoxResult {
  boards: Board[];
}

function centeredY(heightMm: number): number {
  return heightMm / 2;
}

function centeredZ(depthMm: number): number {
  return depthMm / 2;
}

export function validateCustomBoxConfig(config: CustomBoxConfig): CustomBoxValidation {
  const errors: Partial<Record<string, string>> = {};
  const positiveFields: Array<[keyof CustomBoxConfig | string, number, string]> = [
    ['widthMm', config.widthMm, 'Width must be greater than 0.'],
    ['heightMm', config.heightMm, 'Height must be greater than 0.'],
    ['depthMm', config.depthMm, 'Depth must be greater than 0.'],
    ['mainThicknessMm', config.mainThicknessMm, 'Main thickness must be greater than 0.'],
    ['backThicknessMm', config.backThicknessMm, 'Back wall thickness must be greater than 0.'],
  ];

  positiveFields.forEach(([key, value, message]) => {
    if (!(value > 0)) errors[key] = message;
  });

  if (config.walls.back && config.backWallInsetMm < 0) {
    errors.backWallInsetMm = 'Back wall inset cannot be negative.';
  }

  const innerWidth = getInnerWidth(config);
  const innerHeight = getInnerHeight(config);

  if ((config.walls.left || config.walls.right) && config.widthMm <= config.mainThicknessMm) {
    errors.widthMm = 'Width must be larger than the main thickness when side walls are enabled.';
  }

  if ((config.walls.top || config.walls.bottom) && config.heightMm <= config.mainThicknessMm) {
    errors.heightMm = 'Height must be larger than the main thickness when top or bottom walls are enabled.';
  }

  if (config.walls.back && config.backWallMode === 'inside') {
    if (!(innerWidth > 0)) errors.backWallMode = 'Inside back wall needs positive inner width.';
    if (!(innerHeight > 0)) errors.backWallMode = 'Inside back wall needs positive inner height.';
  }

  if (config.walls.back && config.backWallMode === 'overlay') {
    const overlayWidth = config.widthMm - config.backWallInsetMm * 2;
    const overlayHeight = config.heightMm - config.backWallInsetMm * 2;
    if (!(overlayWidth > 0)) errors.backWallInsetMm = 'Inset is too large for the box width.';
    if (!(overlayHeight > 0)) errors.backWallInsetMm = 'Inset is too large for the box height.';
  }

  if (config.doors.enabled) {
    if (config.doors.verticalGapMm < 0) {
      errors.verticalGapMm = 'Vertical gap cannot be negative.';
    }
    if (config.doors.horizontalGapMm < 0) {
      errors.horizontalGapMm = 'Horizontal gap cannot be negative.';
    }

    const doorHeight = config.heightMm - config.doors.verticalGapMm * 2;
    if (!(doorHeight > 0)) {
      errors.verticalGapMm = 'Vertical gap leaves no space for doors.';
    }

    const totalHorizontalGaps = config.doors.count === 1 ? config.doors.horizontalGapMm * 2 : config.doors.horizontalGapMm * 3;
    const availableDoorWidth = config.widthMm - totalHorizontalGaps;
    if (!(availableDoorWidth > 0)) {
      errors.horizontalGapMm = 'Horizontal gap leaves no space for doors.';
    }
  }

  return { isValid: Object.keys(errors).length === 0, errors };
}

export function getInnerWidth(config: CustomBoxConfig): number {
  return config.widthMm - (config.walls.left ? config.mainThicknessMm : 0) - (config.walls.right ? config.mainThicknessMm : 0);
}

export function getInnerHeight(config: CustomBoxConfig): number {
  return config.heightMm - (config.walls.top ? config.mainThicknessMm : 0) - (config.walls.bottom ? config.mainThicknessMm : 0);
}

export function generateCustomBoxBoards(config: CustomBoxConfig, globalThicknessMm: number): CustomBoxResult {
  const boards: Board[] = [];
  const innerWidth = getInnerWidth(config);
  const innerHeight = getInnerHeight(config);

  const sideHeight = config.assemblyMode === 'top_bottom_over' ? innerHeight : config.heightMm;
  const sideY = config.assemblyMode === 'top_bottom_over'
    ? (config.walls.bottom ? config.mainThicknessMm + sideHeight / 2 : sideHeight / 2)
    : centeredY(config.heightMm);

  if (config.walls.left) {
    boards.push(createBoard({
      name: 'Left wall', role: 'side', orientation: 'YZ', material: 'Birch plywood',
      width_mm: config.depthMm, height_mm: sideHeight, thickness_mm: config.mainThicknessMm,
      x_mm: config.mainThicknessMm / 2, y_mm: sideY, z_mm: centeredZ(config.depthMm),
    }, globalThicknessMm));
  }

  if (config.walls.right) {
    boards.push(createBoard({
      name: 'Right wall', role: 'side', orientation: 'YZ', material: 'Birch plywood',
      width_mm: config.depthMm, height_mm: sideHeight, thickness_mm: config.mainThicknessMm,
      x_mm: config.widthMm - config.mainThicknessMm / 2, y_mm: sideY, z_mm: centeredZ(config.depthMm),
    }, globalThicknessMm));
  }

  const topBottomWidth = config.assemblyMode === 'sides_over' ? innerWidth : config.widthMm;
  const topBottomX = config.assemblyMode === 'sides_over' ? (config.walls.left ? config.mainThicknessMm + topBottomWidth / 2 : topBottomWidth / 2) : config.widthMm / 2;

  if (config.walls.bottom) {
    boards.push(createBoard({
      name: 'Bottom wall', role: 'bottom', orientation: 'XZ', material: 'Birch plywood',
      width_mm: topBottomWidth, height_mm: config.depthMm, thickness_mm: config.mainThicknessMm,
      x_mm: topBottomX, y_mm: config.mainThicknessMm / 2, z_mm: centeredZ(config.depthMm),
    }, globalThicknessMm));
  }

  if (config.walls.top) {
    boards.push(createBoard({
      name: 'Top wall', role: 'top', orientation: 'XZ', material: 'Birch plywood',
      width_mm: topBottomWidth, height_mm: config.depthMm, thickness_mm: config.mainThicknessMm,
      x_mm: topBottomX, y_mm: config.heightMm - config.mainThicknessMm / 2, z_mm: centeredZ(config.depthMm),
    }, globalThicknessMm));
  }

  if (config.walls.back) {
    const isInside = config.backWallMode === 'inside';
    const backWidth = isInside ? innerWidth : config.widthMm - config.backWallInsetMm * 2;
    const backHeight = isInside ? innerHeight : config.heightMm - config.backWallInsetMm * 2;
    const backX = isInside ? (config.assemblyMode === 'sides_over' ? (config.walls.left ? config.mainThicknessMm + backWidth / 2 : backWidth / 2) : config.widthMm / 2) : config.widthMm / 2;
    const backY = isInside ? (config.assemblyMode === 'top_bottom_over' ? (config.walls.bottom ? config.mainThicknessMm + backHeight / 2 : backHeight / 2) : config.heightMm / 2) : config.heightMm / 2;
    const backZ = isInside ? config.depthMm - config.backThicknessMm / 2 : config.depthMm + config.backThicknessMm / 2;

    boards.push(createBoard({
      name: 'Back wall', role: 'back', orientation: 'XY', material: 'Hardboard',
      width_mm: backWidth, height_mm: backHeight, thickness_mm: config.backThicknessMm,
      x_mm: backX, y_mm: backY, z_mm: backZ,
      note: isInside ? 'Inside back panel' : `Overlay back panel inset ${config.backWallInsetMm} mm`,
    }, globalThicknessMm));
  }

  if (config.doors.enabled) {
    const doorHeight = config.heightMm - config.doors.verticalGapMm * 2;
    if (config.doors.count === 1) {
      const doorWidth = config.widthMm - config.doors.horizontalGapMm * 2;
      boards.push(createBoard({
        name: 'Front door', role: 'door', orientation: 'XY', material: 'Birch plywood',
        width_mm: doorWidth, height_mm: doorHeight, thickness_mm: config.mainThicknessMm,
        x_mm: config.widthMm / 2,
        y_mm: config.doors.verticalGapMm + doorHeight / 2,
        z_mm: -config.mainThicknessMm / 2,
      }, globalThicknessMm));
    } else {
      const doorWidth = (config.widthMm - config.doors.horizontalGapMm * 3) / 2;
      boards.push(createBoard({
        name: 'Left door', role: 'door', orientation: 'XY', material: 'Birch plywood',
        width_mm: doorWidth, height_mm: doorHeight, thickness_mm: config.mainThicknessMm,
        x_mm: config.doors.horizontalGapMm + doorWidth / 2,
        y_mm: config.doors.verticalGapMm + doorHeight / 2,
        z_mm: -config.mainThicknessMm / 2,
      }, globalThicknessMm));
      boards.push(createBoard({
        name: 'Right door', role: 'door', orientation: 'XY', material: 'Birch plywood',
        width_mm: doorWidth, height_mm: doorHeight, thickness_mm: config.mainThicknessMm,
        x_mm: config.doors.horizontalGapMm * 2 + doorWidth + doorWidth / 2,
        y_mm: config.doors.verticalGapMm + doorHeight / 2,
        z_mm: -config.mainThicknessMm / 2,
      }, globalThicknessMm));
    }
  }

  return { boards };
}
