import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { boardSizeVector, type Board } from '../domain/model';

const CAMERA_DISTANCE = 1800;

function createBoardMaterial(selected: boolean): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: selected ? 0xff8a3d : 0x8ab4f8,
    roughness: 0.85,
    metalness: 0.05,
  });
}

export class PlannerScene {
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly controls: OrbitControls;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly boardGroup = new THREE.Group();
  private readonly grid = new THREE.GridHelper(2000, 200, 0x666666, 0x333333);
  private readonly axes = new THREE.AxesHelper(250);
  private animationFrame = 0;
  private readonly boardMeshes = new Map<string, THREE.Mesh>();
  private onBoardSelected: (id: string | null) => void;

  constructor(container: HTMLElement, onBoardSelected: (id: string | null) => void) {
    this.onBoardSelected = onBoardSelected;
    this.scene.background = new THREE.Color(0x111827);

    this.camera = new THREE.PerspectiveCamera(50, 1, 1, 10000);
    this.camera.position.set(CAMERA_DISTANCE, CAMERA_DISTANCE * 0.8, CAMERA_DISTANCE);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.target.set(300, 240, 300);

    this.scene.add(this.grid);
    this.scene.add(this.axes);
    this.scene.add(this.boardGroup);

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
    this.controls.dispose();
    this.renderer.dispose();
  }

  setGridVisible(visible: boolean): void {
    this.grid.visible = visible;
  }

  renderBoards(boards: Board[], selectedBoardId: string | null): void {
    for (const mesh of this.boardMeshes.values()) {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
    this.boardMeshes.clear();
    this.boardGroup.clear();

    boards.forEach((board) => {
      const [sx, sy, sz] = boardSizeVector(board);
      const geometry = new THREE.BoxGeometry(sx, sy, sz);
      const material = createBoardMaterial(board.id === selectedBoardId);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(board.x_mm, board.y_mm, board.z_mm);
      mesh.userData.boardId = board.id;
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(geometry),
        new THREE.LineBasicMaterial({ color: 0x0f172a }),
      );
      mesh.add(edges);
      this.boardMeshes.set(board.id, mesh);
      this.boardGroup.add(mesh);
    });
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

  private handlePointerDown = (event: PointerEvent): void => {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits: Array<{ object: THREE.Object3D }> = this.raycaster.intersectObjects(this.boardGroup.children, true) as Array<{ object: THREE.Object3D }>;
    const target = hits.find((hit: { object: THREE.Object3D }) => hit.object instanceof THREE.Mesh && hit.object.userData.boardId) ?? null;
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
