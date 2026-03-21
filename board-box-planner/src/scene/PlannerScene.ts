import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { boardSizeVector, type Board } from '../domain/model';

const CAMERA_DISTANCE = 1800;
const ORIENTATION_GIZMO_RADIUS_PX = 28;
const TRANSPARENT_BOARD_OPACITY = 0.28;
const CAMERA_TARGET = new THREE.Vector3(300, 240, 300);
const PERSPECTIVE_CAMERA_OFFSET = new THREE.Vector3(-CAMERA_DISTANCE * 0.9, CAMERA_DISTANCE * 0.65, -CAMERA_DISTANCE * 0.95);
const DOOR_OPEN_ANGLE = Math.PI / 2 - 0.18;
const DOOR_ANIMATION_LERP = 0.14;
type BoardPosition = Pick<Board, 'x_mm' | 'y_mm' | 'z_mm'>;
type AxisKey = keyof BoardPosition;

type ActiveAxisDrag = {
  axis: AxisKey;
  boardId: string;
  originClient: any;
  originWorldPosition: any;
  axisScreenDirection: any;
  snapStepMm: number;
};

type OrientationAxisKey = 'x' | 'y' | 'z';

type OrientationAxisIndicator = {
  root: HTMLDivElement;
  line: HTMLDivElement;
  label: HTMLSpanElement;
};

type DoorAnimationDirection = 'left' | 'right';

type BoardMeshEntry = {
  root: any;
  mesh: any;
  board: Board;
  isDoor: boolean;
  currentDoorAngle?: number;
  targetDoorAngle?: number;
  doorDirection?: DoorAnimationDirection;
};

function createBoardMaterial(selected: boolean, transparencyEnabled: boolean) {
  return new THREE.MeshStandardMaterial({
    color: selected ? 0xff8a3d : 0x8ab4f8,
    roughness: 0.85,
    metalness: 0.05,
    transparent: transparencyEnabled,
    opacity: transparencyEnabled ? TRANSPARENT_BOARD_OPACITY : 1,
    depthWrite: !transparencyEnabled,
  });
}

function createBoardEdges(geometry: any, transparencyEnabled: boolean): any {
  const edgesGeometry = new THREE.EdgesGeometry(geometry);
  const edgesMaterial = transparencyEnabled
    ? new THREE.LineDashedMaterial({
        color: 0xe2e8f0,
        dashSize: 14,
        gapSize: 8,
        transparent: true,
        opacity: 0.9,
        depthTest: false,
      })
    : new THREE.LineBasicMaterial({ color: 0x0f172a });
  const edges = new THREE.LineSegments(edgesGeometry, edgesMaterial);
  if (transparencyEnabled) {
    edges.computeLineDistances();
    edges.renderOrder = 10;
  }
  return edges;
}

function disposeBoardMesh(entry: BoardMeshEntry): void {
  const mesh = entry.mesh;
  mesh.geometry.dispose();
  const material = mesh.material;
  if (Array.isArray(material)) {
    material.forEach((entry: any) => entry.dispose());
  } else {
    material.dispose();
  }
  mesh.children.forEach((child: any) => {
    const line = child as any;
    line.geometry?.dispose?.();
    const childMaterial = line.material;
    if (Array.isArray(childMaterial)) {
      childMaterial.forEach((entry) => entry.dispose());
    } else {
      childMaterial?.dispose?.();
    }
  });
}

function updateBoardGeometry(mesh: any, size: [number, number, number], transparencyEnabled: boolean): void {
  mesh.geometry.dispose();
  mesh.children.forEach((child: any) => {
    const line = child as any;
    line.geometry?.dispose?.();
    line.material?.dispose?.();
  });

  const geometry = new THREE.BoxGeometry(...size);
  mesh.geometry = geometry;
  mesh.clear();
  mesh.add(createBoardEdges(geometry, transparencyEnabled));
  mesh.userData.size = size;
}


function getDoorSwingDirection(board: Board, sortedDoors: Board[]): DoorAnimationDirection {
  if (sortedDoors.length <= 1) return 'left';
  const doorIndex = sortedDoors.findIndex((item) => item.id === board.id);
  if (doorIndex === sortedDoors.length - 1) return 'right';
  return 'left';
}

function updateBoardAppearance(mesh: any, selected: boolean, transparencyEnabled: boolean): void {
  const material = mesh.material as any;
  material.color.set(selected ? 0xff8a3d : 0x8ab4f8);
  material.transparent = transparencyEnabled;
  material.opacity = transparencyEnabled ? TRANSPARENT_BOARD_OPACITY : 1;
  material.depthWrite = !transparencyEnabled;
  material.needsUpdate = true;

  mesh.children.forEach((child: any) => {
    const line = child as any;
    line.geometry?.dispose?.();
    line.material?.dispose?.();
  });
  mesh.clear();
  mesh.add(createBoardEdges(mesh.geometry as any, transparencyEnabled));
}

function createOrientationAxis(container: HTMLElement, axis: OrientationAxisKey): OrientationAxisIndicator {
  const root = document.createElement('div');
  root.className = `orientation-axis orientation-axis-${axis}`;

  const line = document.createElement('div');
  line.className = 'orientation-axis-line';

  const label = document.createElement('span');
  label.className = 'orientation-axis-label';
  label.textContent = axis.toUpperCase();

  root.append(line, label);
  container.appendChild(root);

  return { root, line, label };
}

export class PlannerScene {
  private readonly scene = new THREE.Scene();
  private readonly camera: any;
  private readonly renderer: any;
  private readonly controls: any;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly boardGroup = new THREE.Group();
  private readonly grid = new THREE.GridHelper(2000, 200, 0x666666, 0x333333);
  private readonly axes = new THREE.AxesHelper(250);
  private readonly orientationGizmo: HTMLDivElement;
  private readonly orientationIndicators: Record<OrientationAxisKey, OrientationAxisIndicator>;
  private animationFrame = 0;
  private readonly boardMeshes = new Map<string, BoardMeshEntry>();
  private activeAxisDrag: ActiveAxisDrag | null = null;
  private transparencyEnabled = false;
  private hideDoors = false;
  private openDoors = false;
  private onBoardSelected: (id: string | null) => void;
  private onBoardMoved: (id: string, position: Partial<BoardPosition>) => void;

  constructor(
    container: HTMLElement,
    onBoardSelected: (id: string | null) => void,
    onBoardMoved: (id: string, position: Partial<BoardPosition>) => void,
  ) {
    this.onBoardSelected = onBoardSelected;
    this.onBoardMoved = onBoardMoved;
    this.scene.background = new THREE.Color(0x111827);

    this.camera = new THREE.PerspectiveCamera(50, 1, 1, 10000);
    this.camera.position.copy(CAMERA_TARGET).add(PERSPECTIVE_CAMERA_OFFSET);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(this.renderer.domElement);

    this.orientationGizmo = document.createElement('div');
    this.orientationGizmo.className = 'orientation-gizmo';
    this.orientationIndicators = {
      x: createOrientationAxis(this.orientationGizmo, 'x'),
      y: createOrientationAxis(this.orientationGizmo, 'y'),
      z: createOrientationAxis(this.orientationGizmo, 'z'),
    };
    container.appendChild(this.orientationGizmo);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.target.copy(CAMERA_TARGET);

    this.scene.add(this.grid);
    this.scene.add(this.axes);
    this.scene.add(this.boardGroup);

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const directional = new THREE.DirectionalLight(0xffffff, 1.1);
    directional.position.set(900, 1200, 700);
    this.scene.add(directional);

    this.renderer.domElement.addEventListener('pointerdown', this.handlePointerDown);
    window.addEventListener('pointermove', this.handleWindowPointerMove);
    window.addEventListener('pointerup', this.handleWindowPointerUp);
    window.addEventListener('resize', this.resize);
    this.resize();
    this.updateOrientationGizmo();
    this.animate();
  }

  dispose(): void {
    cancelAnimationFrame(this.animationFrame);
    this.renderer.domElement.removeEventListener('pointerdown', this.handlePointerDown);
    window.removeEventListener('pointermove', this.handleWindowPointerMove);
    window.removeEventListener('pointerup', this.handleWindowPointerUp);
    window.removeEventListener('resize', this.resize);
    this.controls.dispose();
    this.renderer.dispose();
    this.orientationGizmo.remove();
  }

  setGridVisible(visible: boolean): void {
    this.grid.visible = visible;
  }

  setTransparencyEnabled(enabled: boolean): void {
    if (this.transparencyEnabled === enabled) return;
    this.transparencyEnabled = enabled;
    this.boardMeshes.forEach((entry) => {
      updateBoardAppearance(entry.mesh as any, (entry.mesh.userData.isSelected as boolean) ?? false, this.transparencyEnabled);
    });
  }

  setDoorsHidden(enabled: boolean): void {
    this.hideDoors = enabled;
    this.boardMeshes.forEach((entry) => {
      if (!entry.isDoor) return;
      entry.root.visible = !enabled;
    });
  }

  setDoorsOpen(enabled: boolean): void {
    this.openDoors = enabled;
    this.boardMeshes.forEach((entry) => {
      if (!entry.isDoor) return;
      entry.targetDoorAngle = enabled
        ? (entry.doorDirection === 'right' ? DOOR_OPEN_ANGLE : -DOOR_OPEN_ANGLE)
        : 0;
    });
  }

  renderBoards(boards: Board[], selectedBoardId: string | null): void {
    const doorBoards = boards.filter((board) => board.role === 'door' && board.orientation === 'XY').sort((a, b) => a.x_mm - b.x_mm);
    const nextIds = new Set(boards.map((board) => board.id));

    for (const [id, entry] of this.boardMeshes.entries()) {
      if (nextIds.has(id)) continue;
      disposeBoardMesh(entry);
      this.boardGroup.remove(entry.root);
      this.boardMeshes.delete(id);
      if (this.activeAxisDrag?.boardId === id) this.activeAxisDrag = null;
    }

    boards.forEach((board) => {
      const size: [number, number, number] = boardSizeVector(board);
      const isSelected = board.id === selectedBoardId;
      let entry = this.boardMeshes.get(board.id);
      const isDoor = board.role === 'door' && board.orientation === 'XY';
      const doorDirection = isDoor ? getDoorSwingDirection(board, doorBoards) : undefined;

      if (!entry) {
        const geometry = new THREE.BoxGeometry(...size);
        const material = createBoardMaterial(isSelected, this.transparencyEnabled);
        const mesh = new THREE.Mesh(geometry, material);
        mesh.userData.boardId = board.id;
        mesh.userData.size = size;
        mesh.userData.isSelected = isSelected;
        mesh.add(createBoardEdges(geometry, this.transparencyEnabled));

        if (isDoor) {
          const pivot = new THREE.Group();
          const hingeOffset = doorDirection === 'right' ? size[0] / 2 : -size[0] / 2;
          mesh.position.set(-hingeOffset, 0, 0);
          entry = {
            root: pivot,
            mesh,
            board,
            isDoor: true,
            currentDoorAngle: 0,
            targetDoorAngle: this.openDoors ? (doorDirection === 'right' ? DOOR_OPEN_ANGLE : -DOOR_OPEN_ANGLE) : 0,
            doorDirection,
          };
          pivot.add(mesh);
          pivot.visible = !this.hideDoors;
          this.boardMeshes.set(board.id, entry);
          this.boardGroup.add(pivot);
        } else {
          entry = { root: mesh, mesh, board, isDoor: false };
          this.boardMeshes.set(board.id, entry);
          this.boardGroup.add(mesh);
        }
      } else {
        const mesh = entry.mesh;
        const currentSize = mesh.userData.size as [number, number, number] | undefined;
        if (!currentSize || currentSize.some((value, index) => Math.abs(value - size[index]) > 0.001)) {
          updateBoardGeometry(mesh, size, this.transparencyEnabled);
        }
        if (mesh.userData.isSelected !== isSelected || mesh.userData.transparencyEnabled !== this.transparencyEnabled) {
          updateBoardAppearance(mesh, isSelected, this.transparencyEnabled);
        }
        mesh.userData.size = size;
        entry.board = board;
        entry.isDoor = isDoor;
        entry.doorDirection = doorDirection;
        if (isDoor) {
          const hingeOffset = doorDirection === 'right' ? size[0] / 2 : -size[0] / 2;
          mesh.position.set(-hingeOffset, 0, 0);
          entry.root.visible = !this.hideDoors;
          entry.targetDoorAngle = this.openDoors ? (doorDirection === 'right' ? DOOR_OPEN_ANGLE : -DOOR_OPEN_ANGLE) : 0;
        }
      }

      const mesh = entry.mesh;
      mesh.userData.isSelected = isSelected;
      mesh.userData.transparencyEnabled = this.transparencyEnabled;
      if (entry.isDoor) {
        const hingeOffset = entry.doorDirection === 'right' ? size[0] / 2 : -size[0] / 2;
        entry.root.position.set(board.x_mm + hingeOffset, board.y_mm, board.z_mm);
      } else {
        entry.root.position.set(board.x_mm, board.y_mm, board.z_mm);
      }
    });
  }

  resetCamera(): void {
    this.controls.target.copy(CAMERA_TARGET);
    this.camera.up.set(0, 1, 0);
    this.camera.position.copy(CAMERA_TARGET).add(PERSPECTIVE_CAMERA_OFFSET);
    this.camera.lookAt(this.controls.target);
    this.controls.update();
  }

  setView(mode: 'front' | 'top' | 'left' | 'right' | 'perspective'): void {
    const target = this.controls.target.clone();
    switch (mode) {
      case 'front':
        this.camera.position.set(target.x, target.y, target.z + CAMERA_DISTANCE);
        this.camera.up.set(0, 1, 0);
        break;
      case 'top':
        this.camera.position.set(target.x, target.y + CAMERA_DISTANCE, target.z);
        this.camera.up.set(0, 0, -1);
        break;
      case 'left':
        this.camera.position.set(target.x - CAMERA_DISTANCE, target.y, target.z);
        this.camera.up.set(0, 1, 0);
        break;
      case 'right':
        this.camera.position.set(target.x + CAMERA_DISTANCE, target.y, target.z);
        this.camera.up.set(0, 1, 0);
        break;
      case 'perspective':
        this.resetCamera();
        return;
    }
    this.camera.lookAt(target);
    this.controls.update();
  }

  beginAxisDrag(axis: AxisKey, boardId: string, clientX: number, clientY: number, snapStepMm: number): void {
    const entry = this.boardMeshes.get(boardId);
    if (!entry) return;

    const origin = new THREE.Vector3(entry.board.x_mm, entry.board.y_mm, entry.board.z_mm);
    const axisVector = new THREE.Vector3(
      axis === 'x_mm' ? 1 : 0,
      axis === 'y_mm' ? 1 : 0,
      axis === 'z_mm' ? 1 : 0,
    );
    const originScreen = this.worldToScreen(origin);
    const offsetScreen = this.worldToScreen(origin.clone().add(axisVector.clone().multiplyScalar(100)));
    const direction = offsetScreen.sub(originScreen);

    if (direction.lengthSq() < 4) {
      direction.set(1, 0);
    } else {
      direction.normalize();
    }

    this.activeAxisDrag = {
      axis,
      boardId,
      originClient: new THREE.Vector2(clientX, clientY),
      originWorldPosition: origin,
      axisScreenDirection: direction,
      snapStepMm,
    };

    this.controls.enabled = false;
    document.body.classList.add('axis-dragging');
  }

  private worldToScreen(point: any): any {
    const projected = point.clone().project(this.camera);
    const rect = this.renderer.domElement.getBoundingClientRect();
    return new THREE.Vector2(
      rect.left + ((projected.x + 1) * rect.width) / 2,
      rect.top + ((-projected.y + 1) * rect.height) / 2,
    );
  }

  private updateOrientationGizmo(): void {
    const inverseQuaternion = this.camera.quaternion.clone().invert();
    const axes = {
      x: { vector: new THREE.Vector3(1, 0, 0), colorVar: '--axis-x-color' },
      y: { vector: new THREE.Vector3(0, 1, 0), colorVar: '--axis-y-color' },
      z: { vector: new THREE.Vector3(0, 0, 1), colorVar: '--axis-z-color' },
    } satisfies Record<OrientationAxisKey, { vector: any; colorVar: string }>;

    (Object.entries(axes) as Array<[OrientationAxisKey, { vector: any; colorVar: string }]>) .forEach(([axis, config]) => {
      const indicator = this.orientationIndicators[axis];
      const cameraSpaceVector = config.vector.clone().applyQuaternion(inverseQuaternion);
      const screenVector = new THREE.Vector2(cameraSpaceVector.x, -cameraSpaceVector.y);
      const screenLength = screenVector.length();
      const normalized = screenLength > 0.0001 ? screenVector.divideScalar(screenLength) : new THREE.Vector2(1, 0);
      const length = ORIENTATION_GIZMO_RADIUS_PX * (0.55 + Math.min(screenLength, 1) * 0.45);
      const endX = normalized.x * length;
      const endY = normalized.y * length;
      const depthFactor = (cameraSpaceVector.z + 1) / 2;

      indicator.root.style.transform = `translate(${endX}px, ${endY}px)`;
      indicator.line.style.transform = `translateY(-50%) rotate(${Math.atan2(endY, endX)}rad)`;
      indicator.line.style.width = `${length}px`;
      indicator.root.style.zIndex = `${Math.round(depthFactor * 100)}`;
      indicator.root.style.opacity = `${0.45 + (1 - depthFactor) * 0.55}`;
      indicator.label.style.boxShadow = cameraSpaceVector.z < 0
        ? '0 0 0 2px rgba(15, 23, 42, 0.92)'
        : '0 0 0 1px rgba(15, 23, 42, 0.55)';
    });
  }

  private handleWindowPointerMove = (event: PointerEvent): void => {
    if (!this.activeAxisDrag) return;
    const drag = this.activeAxisDrag;
    const entry = this.boardMeshes.get(drag.boardId);
    if (!entry) return;

    const pointerDelta = new THREE.Vector2(event.clientX - drag.originClient.x, event.clientY - drag.originClient.y);
    const movementOnAxisPx = pointerDelta.dot(drag.axisScreenDirection);
    const pxPerStep = 18;
    const movementMm = Math.round(movementOnAxisPx / pxPerStep) * drag.snapStepMm;

    const nextPosition = drag.originWorldPosition.clone();
    nextPosition[drag.axis === 'x_mm' ? 'x' : drag.axis === 'y_mm' ? 'y' : 'z'] += movementMm;

    this.onBoardMoved(drag.boardId, {
      [drag.axis]: nextPosition[drag.axis === 'x_mm' ? 'x' : drag.axis === 'y_mm' ? 'y' : 'z'],
    } as Partial<BoardPosition>);
  };

  private handleWindowPointerUp = (): void => {
    if (!this.activeAxisDrag) return;
    this.activeAxisDrag = null;
    this.controls.enabled = true;
    document.body.classList.remove('axis-dragging');
  };

  private handlePointerDown = (event: PointerEvent): void => {
    if (this.activeAxisDrag) {
      return;
    }
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits: Array<{ object: any }> = this.raycaster.intersectObjects(this.boardGroup.children, true) as Array<{ object: any }>;
    const target = hits.find((hit: { object: any }) => hit.object instanceof THREE.Mesh && hit.object.userData.boardId) ?? null;
    this.onBoardSelected(target?.object.userData.boardId ?? null);
  };

  private resize = (): void => {
    const parent = this.renderer.domElement.parentElement;
    if (!parent) return;
    const { clientWidth, clientHeight } = parent;
    this.camera.aspect = clientWidth / Math.max(clientHeight, 1);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(clientWidth, clientHeight);
  };

  private animate = (): void => {
    this.animationFrame = requestAnimationFrame(this.animate);
    this.controls.update();
    this.boardMeshes.forEach((entry) => {
      if (!entry.isDoor) return;
      const current = entry.currentDoorAngle ?? 0;
      const target = this.hideDoors ? 0 : (entry.targetDoorAngle ?? 0);
      const next = Math.abs(target - current) < 0.001 ? target : current + (target - current) * DOOR_ANIMATION_LERP;
      entry.currentDoorAngle = next;
      entry.root.rotation.y = next;
    });
    this.updateOrientationGizmo();
    this.renderer.render(this.scene, this.camera);
  };
}
