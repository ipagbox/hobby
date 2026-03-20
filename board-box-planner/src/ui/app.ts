import { ORIENTATION_OPTIONS, ROLE_OPTIONS, SNAP_STEPS_MM, type Board } from '../domain/model';
import { PlannerScene } from '../scene/PlannerScene';
import { PlannerStore, type AppState } from '../state/store';

const AXIS_BUTTONS: Array<{ axis: 'x_mm' | 'y_mm' | 'z_mm'; label: string; colorClass: string }> = [
  { axis: 'x_mm', label: 'X', colorClass: 'axis-x' },
  { axis: 'y_mm', label: 'Y', colorClass: 'axis-y' },
  { axis: 'z_mm', label: 'Z', colorClass: 'axis-z' },
];

function mmInput(label: string, value: number): string {
  return `<label><span>${label}</span><input data-number-input="${label}" type="number" value="${value}" step="1" /></label>`;
}

export function createApp(root: HTMLElement): void {
  const store = new PlannerStore();

  root.innerHTML = `
    <div class="app-shell">
      <header class="toolbar">
        <div class="toolbar-group">
          <button data-action="new-project">New project</button>
          <button data-action="new-board">New board</button>
          <button data-action="duplicate">Duplicate</button>
          <button data-action="delete">Delete</button>
        </div>
        <div class="toolbar-group">
          <button data-action="save">Save project</button>
          <label class="file-button">Load project<input data-action="load" type="file" accept="application/json" hidden /></label>
          <button data-action="load-sample">Load sample</button>
        </div>
        <div class="toolbar-group">
          <button data-action="reset-camera">Reset camera</button>
          <button data-view="front">Front</button>
          <button data-view="top">Top</button>
          <button data-view="left">Left</button>
          <button data-view="right">Right</button>
          <button data-view="perspective">Perspective</button>
        </div>
        <div class="toolbar-group compact">
          <label><span>Grid</span><input data-action="toggle-grid" type="checkbox" /></label>
          <label>
            <span>Snap</span>
            <select data-action="snap-step"></select>
          </label>
        </div>
      </header>
      <main class="layout">
        <aside class="panel object-list-panel">
          <div class="panel-header"><h2>Boards</h2></div>
          <div class="project-meta">
            <label>
              <span>Project name</span>
              <input data-project-name type="text" />
            </label>
            <label>
              <span>Global thickness (mm)</span>
              <input data-project-thickness type="number" step="1" />
            </label>
          </div>
          <div class="board-list" data-board-list></div>
        </aside>
        <section class="viewport-panel panel">
          <div class="viewport" data-viewport></div>
          <div class="move-pad">
            <span>Move selected</span>
            <div class="move-pad-grid">
              ${AXIS_BUTTONS.map(
                ({ axis, label, colorClass }) => `
                  <div class="move-axis-group">
                    <button class="${colorClass}" data-move="${axis}:1">${label}+</button>
                    <button class="${colorClass}" data-move="${axis}:-1">${label}-</button>
                  </div>
                `,
              ).join('')}
            </div>
          </div>
        </section>
        <aside class="panel properties-panel" data-properties-panel></aside>
      </main>
    </div>
  `;

  const viewport = root.querySelector<HTMLElement>('[data-viewport]');
  const boardList = root.querySelector<HTMLElement>('[data-board-list]');
  const propertiesPanel = root.querySelector<HTMLElement>('[data-properties-panel]');
  const projectNameInput = root.querySelector<HTMLInputElement>('[data-project-name]');
  const projectThicknessInput = root.querySelector<HTMLInputElement>('[data-project-thickness]');
  const gridToggle = root.querySelector<HTMLInputElement>('[data-action="toggle-grid"]');
  const snapSelect = root.querySelector<HTMLSelectElement>('[data-action="snap-step"]');
  const loadInput = root.querySelector<HTMLInputElement>('[data-action="load"]');

  if (!viewport || !boardList || !propertiesPanel || !projectNameInput || !projectThicknessInput || !gridToggle || !snapSelect || !loadInput) {
    throw new Error('App UI failed to initialize');
  }

  snapSelect.innerHTML = SNAP_STEPS_MM.map((step) => `<option value="${step}">${step} mm</option>`).join('');

  const scene = new PlannerScene(
    viewport,
    (id) => store.setSelectedBoard(id),
    (id, position) => store.moveBoardToPosition(id, position),
  );

  root.querySelectorAll<HTMLButtonElement>('[data-action]').forEach((button) => {
    button.addEventListener('click', () => {
      const action = button.dataset.action;
      switch (action) {
        case 'new-project':
          store.newProject();
          break;
        case 'new-board':
          store.addBoard();
          break;
        case 'duplicate':
          store.duplicateSelectedBoard();
          break;
        case 'delete':
          store.deleteSelectedBoard();
          break;
        case 'save':
          store.saveToFile();
          break;
        case 'reset-camera':
          scene.resetCamera();
          break;
        case 'load-sample':
          store.loadSampleProject();
          break;
      }
    });
  });

  root.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((button) => {
    button.addEventListener('click', () => scene.setView(button.dataset.view as 'front' | 'top' | 'left' | 'right' | 'perspective'));
  });

  root.querySelectorAll<HTMLButtonElement>('[data-move]').forEach((button) => {
    button.addEventListener('click', () => {
      const [axis, sign] = (button.dataset.move ?? 'x_mm:1').split(':') as ['x_mm' | 'y_mm' | 'z_mm', string];
      const step = store.getState().project.settings.snapStepMm * Number(sign);
      store.moveSelectedBoard(axis, step);
    });
  });

  gridToggle.addEventListener('change', () => {
    const current = store.getState().project.settings;
    store.updateProject({ settings: { ...current, gridVisible: gridToggle.checked } });
  });

  snapSelect.addEventListener('change', () => {
    const current = store.getState().project.settings;
    store.updateProject({ settings: { ...current, snapStepMm: Number(snapSelect.value) as 1 | 5 | 10 } });
  });

  projectNameInput.addEventListener('change', () => store.updateProject({ name: projectNameInput.value }));
  projectThicknessInput.addEventListener('change', () => {
    const value = Number(projectThicknessInput.value);
    const state = store.getState();
    store.updateProject({
      board_thickness_mm: value,
      boards: state.project.boards.map((board) => ({
        ...board,
        thickness_mm: board.thickness_mm === state.project.board_thickness_mm ? value : board.thickness_mm,
      })),
    });
  });

  loadInput.addEventListener('change', async () => {
    const file = loadInput.files?.[0];
    if (file) {
      await store.loadFromFile(file);
      loadInput.value = '';
    }
  });

  const renderProperties = (board: Board | undefined): void => {
    if (!board) {
      propertiesPanel.innerHTML = '<div class="panel-header"><h2>Properties</h2></div><p class="empty-state">Select a board to edit its properties.</p>';
      return;
    }

    propertiesPanel.innerHTML = `
      <div class="panel-header"><h2>Properties</h2></div>
      <div class="form-grid">
        <label><span>Name</span><input data-field="name" type="text" value="${board.name}" /></label>
        <label><span>Role</span><select data-field="role">${ROLE_OPTIONS.map((role) => `<option value="${role}" ${board.role === role ? 'selected' : ''}>${role}</option>`).join('')}</select></label>
        <label><span>Material</span><input data-field="material" type="text" value="${board.material}" /></label>
        ${mmInput('width_mm', board.width_mm)}
        ${mmInput('height_mm', board.height_mm)}
        ${mmInput('thickness_mm', board.thickness_mm)}
        ${mmInput('x_mm', board.x_mm)}
        ${mmInput('y_mm', board.y_mm)}
        ${mmInput('z_mm', board.z_mm)}
        <label><span>Orientation</span><select data-field="orientation">${ORIENTATION_OPTIONS.map((orientation) => `<option value="${orientation}" ${board.orientation === orientation ? 'selected' : ''}>${orientation}</option>`).join('')}</select></label>
        <label class="full-width"><span>Note</span><textarea data-field="note" rows="4">${board.note}</textarea></label>
      </div>
    `;

    propertiesPanel.querySelectorAll<HTMLInputElement>('[data-number-input]').forEach((input) => {
      input.addEventListener('change', () => {
        const field = input.dataset.numberInput as keyof Board;
        const value = Number(input.value);
        if (field === 'x_mm' || field === 'y_mm' || field === 'z_mm') {
          store.moveBoardToPosition(board.id, { [field]: value } as Partial<Pick<Board, 'x_mm' | 'y_mm' | 'z_mm'>>);
          return;
        }
        store.updateBoard(board.id, { [field]: value } as Partial<Board>);
      });
    });

    propertiesPanel.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('[data-field]').forEach((field) => {
      field.addEventListener('change', () => {
        const key = field.dataset.field as keyof Board;
        const value = field instanceof HTMLSelectElement || field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement ? field.value : '';
        if (key === 'orientation') {
          store.setOrientation(board.id, value as Board['orientation']);
          return;
        }
        store.updateBoard(board.id, { [key]: value } as Partial<Board>);
      });
    });
  };

  const renderBoardList = (state: AppState): void => {
    boardList.innerHTML = state.project.boards
      .map(
        (board) => `
          <button class="board-row ${board.id === state.selectedBoardId ? 'selected' : ''}" data-board-id="${board.id}">
            <strong contenteditable="true" data-rename-id="${board.id}">${board.name}</strong>
            <span>${board.role} · ${board.orientation}</span>
          </button>
        `,
      )
      .join('');

    boardList.querySelectorAll<HTMLElement>('[data-board-id]').forEach((element) => {
      element.addEventListener('click', () => store.setSelectedBoard(element.dataset.boardId ?? null));
    });

    boardList.querySelectorAll<HTMLElement>('[data-rename-id]').forEach((element) => {
      element.addEventListener('blur', () => {
        const id = element.dataset.renameId;
        if (id) store.updateBoard(id, { name: element.textContent?.trim() || 'Board' });
      });
    });
  };

  store.subscribe((state) => {
    scene.setGridVisible(state.project.settings.gridVisible);
    scene.renderBoards(state.project.boards, state.selectedBoardId);
    renderBoardList(state);
    renderProperties(state.project.boards.find((board) => board.id === state.selectedBoardId));
    projectNameInput.value = state.project.name;
    projectThicknessInput.value = String(state.project.board_thickness_mm);
    gridToggle.checked = state.project.settings.gridVisible;
    snapSelect.value = String(state.project.settings.snapStepMm);
  });

  window.addEventListener('beforeunload', () => scene.dispose(), { once: true });
}
