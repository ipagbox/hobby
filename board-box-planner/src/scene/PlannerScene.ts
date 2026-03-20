import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { boardSizeVector, type Board } from '../domain/model';

const CAMERA_DISTANCE = 1800;
type BoardPosition = Pick<Board, 'x_mm' | 'y_mm' | 'z_mm'>;

function createBoardMaterial(selected: boolean) {
  return new THREE.MeshStandardMaterial({
    color: selected ? 0xff8a3d : 0x8ab4f8,
    roughness: 0.85,
    metalness: 0.05,
  });
}

function disposeBoardMesh(mesh: any): void {
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

function updateBoardGeometry(mesh: any, size: [number, number, number]): void {
  mesh.geometry.dispose();
  mesh.children.forEach((child: any) => {
    const line = child as any;
    line.geometry?.dispose?.();
    line.material?.dispose?.();
  });

  const geometry = new THREE.BoxGeometry(...size);
  mesh.geometry = geometry;
  mesh.clear();
  mesh.add(
    new THREE.LineSegments(
      new THREE.EdgesGeometry(geometry),
      new THREE.LineBasicMaterial({ color: 0x0f172a }),
    ),
  );
  mesh.userData.size = size;
}

export class PlannerScene {
  private readonly scene = new THREE.Scene();
  private readonly camera: any;
  private readonly renderer: any;
  private readonly controls: any;
  private readonly transformControls: any;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly boardGroup = new THREE.Group();
  private readonly grid = new THREE.GridHelper(2000, 200, 0x666666, 0x333333);
  private readonly axes = new THREE.AxesHelper(250);
  private animationFrame = 0;
  private readonly boardMeshes = new Map<string, any>();
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
    this.camera.position.set(CAMERA_DISTANCE, CAMERA_DISTANCE * 0.8, CAMERA_DISTANCE);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.target.set(300, 240, 300);

    this.transformControls = new TransformControls(this.camera, this.renderer.domElement);
    this.transformControls.setMode('translate');
    this.transformControls.setSpace('world');
    this.transformControls.addEventListener('dragging-changed', ((event: { value: boolean }) => {
      this.controls.enabled = !event.value;
    }) as unknown as EventListener);
    this.transformControls.addEventListener('objectChange', this.handleTransformChange as EventListener);

    this.scene.add(this.grid);
    this.scene.add(this.axes);
    this.scene.add(this.boardGroup);
    this.scene.add(this.transformControls);

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const directional = new THREE.DirectionalLight(0xffffff, 1.1);
    directional.position.set(900, 1200, 700);
    this.scene.add(directional);

    this.renderer.domElement.addEventListener('pointerdown', this.handlePointerDown);
    window.addEventListener('resize', this.resize);
    this.resize();
    this.animate();
  }

  dispose(): void {
    cancelAnimationFrame(this.animationFrame);
    this.renderer.domElement.removeEventListener('pointerdown', this.handlePointerDown);
    window.removeEventListener('resize', this.resize);
    this.transformControls.removeEventListener('objectChange', this.handleTransformChange as EventListener);
    this.controls.dispose();
    this.transformControls.dispose();
    this.renderer.dispose();
  }

  setGridVisible(visible: boolean): void {
    this.grid.visible = visible;
  }

  renderBoards(boards: Board[], selectedBoardId: string | null): void {
    const nextIds = new Set(boards.map((board) => board.id));

    for (const [id, mesh] of this.boardMeshes.entries()) {
      if (nextIds.has(id)) continue;
      if (this.transformControls.object === mesh) {
        this.transformControls.detach();
      }
      disposeBoardMesh(mesh);
      this.boardGroup.remove(mesh);
      this.boardMeshes.delete(id);
    }

    boards.forEach((board) => {
      const [sx, sy, sz] = boardSizeVector(board);
      let mesh = this.boardMeshes.get(board.id);

      if (!mesh) {
        const geometry = new THREE.BoxGeometry(sx, sy, sz);
        const material = createBoardMaterial(board.id === selectedBoardId);
        mesh = new THREE.Mesh(geometry, material);
        mesh.userData.boardId = board.id;
        mesh.userData.size = [sx, sy, sz];
        const edges = new THREE.LineSegments(
          new THREE.EdgesGeometry(geometry),
          new THREE.LineBasicMaterial({ color: 0x0f172a }),
        );
        mesh.add(edges);
        this.boardMeshes.set(board.id, mesh);
        this.boardGroup.add(mesh);
      } else {
        const currentSize = mesh.userData.size as [number, number, number] | undefined;
        if (!currentSize || currentSize.some((value, index) => Math.abs(value - [sx, sy, sz][index]) > 0.001)) {
          updateBoardGeometry(mesh, [sx, sy, sz]);
        }
        (mesh.material as any).color.set(board.id === selectedBoardId ? 0xff8a3d : 0x8ab4f8);
      }

      mesh.position.set(board.x_mm, board.y_mm, board.z_mm);
    });

    const selectedMesh = selectedBoardId ? this.boardMeshes.get(selectedBoardId) ?? null : null;
    if (selectedMesh) {
      this.transformControls.attach(selectedMesh);
      this.transformControls.enabled = true;
    } else {
      this.transformControls.detach();
      this.transformControls.enabled = false;
    }
  }

  resetCamera(): void {
    this.camera.position.set(CAMERA_DISTANCE, CAMERA_DISTANCE * 0.8, CAMERA_DISTANCE);
    this.controls.target.set(300, 240, 300);
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

  private handleTransformChange = (): void => {
    const object = this.transformControls.object;
    if (!object?.userData.boardId) return;
    this.onBoardMoved(object.userData.boardId, {
      x_mm: object.position.x,
      y_mm: object.position.y,
      z_mm: object.position.z,
    });
  };

  private handlePointerDown = (event: PointerEvent): void => {
    if (this.transformControls.dragging) {
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
    this.renderer.render(this.scene, this.camera);
  };
}
