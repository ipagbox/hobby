import { ORIENTATION_OPTIONS, ROLE_OPTIONS, SNAP_STEPS_MM, DEFAULT_BOARD_THICKNESS_MM, type Board } from '../domain/model';
import {
  validateCustomBoxConfig,
  type AssemblyMode,
  type BackWallMode,
  type CustomBoxConfig,
} from '../domain/customBox';
import { PlannerScene } from '../scene/PlannerScene';
import { PlannerStore, type AppState } from '../state/store';

const AXIS_BUTTONS: Array<{ axis: 'x_mm' | 'y_mm' | 'z_mm'; label: string; colorClass: string }> = [
  { axis: 'x_mm', label: 'X', colorClass: 'axis-x' },
  { axis: 'y_mm', label: 'Y', colorClass: 'axis-y' },
  { axis: 'z_mm', label: 'Z', colorClass: 'axis-z' },
];

const TOOLBAR_ACTIONS = {
  project: [
    { action: 'new-project', icon: '📁', label: 'New project' },
    { action: 'save', icon: '💾', label: 'Save project' },
  ],
  boards: [
    { action: 'new-board', icon: '➕', label: 'New board' },
    { action: 'duplicate', icon: '⧉', label: 'Duplicate board' },
    { action: 'delete', icon: '🗑', label: 'Delete board' },
  ],
} as const;

const VIEW_ACTIONS = [
  { view: 'front', icon: 'F', label: 'Front view' },
  { view: 'top', icon: 'T', label: 'Top view' },
  { view: 'left', icon: 'L', label: 'Left view' },
  { view: 'right', icon: 'R', label: 'Right view' },
  { view: 'perspective', icon: '3D', label: 'Perspective view' },
] as const;

function mmInput(label: string, value: number): string {
  return `<label><span>${label}</span><input data-number-input="${label}" type="number" value="${value}" step="1" /></label>`;
}

function createIconButton(action: string, icon: string, label: string, extraClass = ''): string {
  return `
    <button type="button" class="icon-button ${extraClass}" data-action="${action}" title="${label}" aria-label="${label}">
      <span class="icon-button__glyph" aria-hidden="true">${icon}</span>
    </button>
  `;
}

function createViewButton(view: string, icon: string, label: string): string {
  return `
    <button type="button" class="icon-button icon-button--view" data-view="${view}" title="${label}" aria-label="${label}">
      <span class="icon-button__glyph" aria-hidden="true">${icon}</span>
    </button>
  `;
}

function getDefaultCustomConfig(globalThicknessMm: number): CustomBoxConfig {
  const mainThicknessMm = globalThicknessMm || DEFAULT_BOARD_THICKNESS_MM;
  return {
    widthMm: 600,
    heightMm: 720,
    depthMm: 350,
    walls: { left: true, right: true, top: true, bottom: true, back: true },
    assemblyMode: 'sides_over',
    mainThicknessMm,
    backThicknessMm: 4,
    backWallMode: 'inside',
    backWallInsetMm: 0,
    doors: { enabled: false, count: 2, verticalGapMm: 2, horizontalGapMm: 2 },
    dividers: { verticalCount: 0, horizontalCount: 0, frontGapMm: 5 },
  };
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function createCustomGenerationModal(config: CustomBoxConfig, errors: Partial<Record<string, string>>): string {
  const fieldError = (key: string) => (errors[key] ? `<span class="field-error">${escapeHtml(errors[key] ?? '')}</span>` : '');
  const checkbox = (key: keyof CustomBoxConfig['walls'], label: string) => `
    <label class="check-option"><input data-custom-wall="${key}" type="checkbox" ${config.walls[key] ? 'checked' : ''} /> <span>${label}</span></label>
  `;

  return `
    <div class="modal-backdrop" data-custom-modal>
      <div class="modal-card">
        <div class="panel-header modal-header">
          <h2>Custom Generation</h2>
          <button type="button" data-custom-close>×</button>
        </div>
        <div class="modal-body">
          <section class="modal-section">
            <h3>Dimensions (mm)</h3>
            <div class="form-grid compact-grid">
              <label><span>Width</span><input data-custom-number="widthMm" type="number" min="1" step="1" value="${config.widthMm}" />${fieldError('widthMm')}</label>
              <label><span>Height</span><input data-custom-number="heightMm" type="number" min="1" step="1" value="${config.heightMm}" />${fieldError('heightMm')}</label>
              <label><span>Depth</span><input data-custom-number="depthMm" type="number" min="1" step="1" value="${config.depthMm}" />${fieldError('depthMm')}</label>
            </div>
          </section>

          <section class="modal-section">
            <h3>Walls</h3>
            <div class="checkbox-grid">
              ${checkbox('left', 'Left')}
              ${checkbox('right', 'Right')}
              ${checkbox('top', 'Top')}
              ${checkbox('bottom', 'Bottom')}
              ${checkbox('back', 'Back')}
            </div>
          </section>

          <section class="modal-section">
            <h3>Assembly mode</h3>
            <label class="radio-option"><input data-custom-assembly value="sides_over" type="radio" name="assemblyMode" ${config.assemblyMode === 'sides_over' ? 'checked' : ''} /> <span>Sides over</span><small>Sides full height. Top/bottom fit between them.</small></label>
            <label class="radio-option"><input data-custom-assembly value="top_bottom_over" type="radio" name="assemblyMode" ${config.assemblyMode === 'top_bottom_over' ? 'checked' : ''} /> <span>Top &amp; bottom over</span><small>Top/bottom full length. Sides fit between them.</small></label>
          </section>

          <section class="modal-section">
            <h3>Thicknesses</h3>
            <div class="form-grid compact-grid">
              <label><span>Main</span><input data-custom-number="mainThicknessMm" type="number" min="1" step="1" value="${config.mainThicknessMm}" />${fieldError('mainThicknessMm')}</label>
              <label><span>Back thickness</span><input data-custom-number="backThicknessMm" type="number" min="1" step="1" value="${config.backThicknessMm}" />${fieldError('backThicknessMm')}</label>
            </div>
          </section>

          ${config.walls.back ? `
            <section class="modal-section">
              <h3>Back configuration</h3>
              <label class="radio-option"><input data-custom-back-mode value="inside" type="radio" name="backWallMode" ${config.backWallMode === 'inside' ? 'checked' : ''} /> <span>Inside</span><small>Panel sits inside the box.</small></label>
              <label class="radio-option"><input data-custom-back-mode value="overlay" type="radio" name="backWallMode" ${config.backWallMode === 'overlay' ? 'checked' : ''} /> <span>Overlay</span><small>Panel overlays the back side.</small></label>
              <div class="form-grid compact-grid">
                <label><span>Back inset (mm)</span><input data-custom-number="backWallInsetMm" type="number" min="0" step="1" value="${config.backWallInsetMm}" ${config.backWallMode === 'inside' ? 'disabled' : ''} />${fieldError('backWallInsetMm')}${fieldError('backWallMode')}</label>
              </div>
            </section>
          ` : ''}

          <section class="modal-section">
            <h3>Inner dividers</h3>
            <div class="form-grid compact-grid">
              <label><span>Vertical count</span><input data-custom-number="verticalDividerCount" type="number" min="0" step="1" value="${config.dividers.verticalCount}" />${fieldError('verticalDividerCount')}</label>
              <label><span>Horizontal count</span><input data-custom-number="horizontalDividerCount" type="number" min="0" step="1" value="${config.dividers.horizontalCount}" />${fieldError('horizontalDividerCount')}</label>
              <label><span>Front gap, mm</span><input data-custom-number="frontGapMm" type="number" min="0" step="1" value="${config.dividers.frontGapMm}" />${fieldError('frontGapMm')}</label>
            </div>
          </section>

          <section class="modal-section">
            <h3>Doors</h3>
            <label class="check-option"><input data-custom-doors-enabled type="checkbox" ${config.doors.enabled ? 'checked' : ''} /> <span>Front doors</span></label>
            ${config.doors.enabled ? `
              <div class="form-grid compact-grid nested-grid">
                <label><span>Count</span><input data-custom-number="doorCount" type="number" min="1" step="1" value="${config.doors.count}" />${fieldError('doorCount')}</label>
                <label><span>Top/bottom gap, mm</span><input data-custom-number="verticalGapMm" type="number" min="0" step="1" value="${config.doors.verticalGapMm}" />${fieldError('verticalGapMm')}</label>
                <label><span>Side gap / center gap, mm</span><input data-custom-number="horizontalGapMm" type="number" min="0" step="1" value="${config.doors.horizontalGapMm}" />${fieldError('horizontalGapMm')}</label>
              </div>
            ` : ''}
          </section>
        </div>
        <div class="modal-actions">
          <button type="button" data-custom-close>Cancel</button>
          <button type="button" data-custom-confirm ${Object.keys(errors).length ? 'disabled' : ''}>Generate</button>
        </div>
      </div>
    </div>
  `;
}

export function createApp(root: HTMLElement): void {
  const store = new PlannerStore();
  let customConfig = getDefaultCustomConfig(store.getState().project.board_thickness_mm);

  root.innerHTML = `
    <div class="app-shell">
      <header class="toolbar">
        <div class="toolbar-groups">
          <div class="toolbar-group toolbar-group--icons" aria-label="Project actions">
            <div class="toolbar-section-label">Project</div>
            <div class="toolbar-icon-strip">
              ${TOOLBAR_ACTIONS.project.map(({ action, icon, label }) => createIconButton(action, icon, label)).join('')}
              <label class="icon-button icon-button--file" title="Load project" aria-label="Load project">
                <span class="icon-button__glyph" aria-hidden="true">📂</span>
                <input data-action="load" type="file" accept="application/json" hidden />
              </label>
            </div>
          </div>

          <div class="toolbar-group toolbar-group--icons" aria-label="Board actions">
            <div class="toolbar-section-label">Boards</div>
            <div class="toolbar-icon-strip">
              ${TOOLBAR_ACTIONS.boards.map(({ action, icon, label }) => createIconButton(action, icon, label)).join('')}
            </div>
          </div>

          <div class="toolbar-group toolbar-group--custom" aria-label="Custom generation">
            <div class="toolbar-section-label">Generate</div>
            ${createIconButton('custom-generation', '✨', 'Custom Generation', 'icon-button--accent')}
          </div>

          <div class="toolbar-group toolbar-group--icons" aria-label="Camera views">
            <div class="toolbar-section-label">Views</div>
            <div class="toolbar-icon-strip">
              ${VIEW_ACTIONS.map(({ view, icon, label }) => createViewButton(view, icon, label)).join('')}
            </div>
          </div>
        </div>

        <div class="toolbar-group toolbar-group--settings compact">
          <label class="toolbar-toggle">
            <input data-action="toggle-grid" type="checkbox" />
            <span>Grid</span>
          </label>
          <label class="toolbar-toggle">
            <input data-action="toggle-snap" type="checkbox" />
            <span>Snap</span>
          </label>
          <label class="toolbar-field">
            <span>Step</span>
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
          <label class="viewport-toggle">
            <input data-action="toggle-transparency" type="checkbox" />
            <span>Transparency</span>
          </label>
          <div class="move-pad">
            <span>Move selected</span>
            <div class="move-pad-grid">
              ${AXIS_BUTTONS.map(
                ({ axis, label, colorClass }) => `
                  <div class="move-axis-group ${colorClass}">
                    <button class="move-step" data-move="${axis}:-1">${label}−</button>
                    <button class="move-drag" data-drag-axis="${axis}" title="Hold and drag to move along ${label}">${label} drag</button>
                    <button class="move-step" data-move="${axis}:1">${label}+</button>
                  </div>
                `,
              ).join('')}
            </div>
            <small class="move-pad-hint">Tap ± for one step, or hold the middle block and drag the mouse to move along that axis.</small>
          </div>
        </section>
        <aside class="panel properties-panel" data-properties-panel></aside>
      </main>
      <div data-modal-root></div>
    </div>
  `;

  const viewport = root.querySelector<HTMLElement>('[data-viewport]');
  const boardList = root.querySelector<HTMLElement>('[data-board-list]');
  const propertiesPanel = root.querySelector<HTMLElement>('[data-properties-panel]');
  const projectNameInput = root.querySelector<HTMLInputElement>('[data-project-name]');
  const projectThicknessInput = root.querySelector<HTMLInputElement>('[data-project-thickness]');
  const gridToggle = root.querySelector<HTMLInputElement>('[data-action="toggle-grid"]');
  const snapToggle = root.querySelector<HTMLInputElement>('[data-action="toggle-snap"]');
  const snapSelect = root.querySelector<HTMLSelectElement>('[data-action="snap-step"]');
  const loadInput = root.querySelector<HTMLInputElement>('[data-action="load"]');
  const transparencyToggle = root.querySelector<HTMLInputElement>('[data-action="toggle-transparency"]');
  const modalRoot = root.querySelector<HTMLElement>('[data-modal-root]');

  if (!viewport || !boardList || !propertiesPanel || !projectNameInput || !projectThicknessInput || !gridToggle || !snapToggle || !snapSelect || !loadInput || !transparencyToggle || !modalRoot) {
    throw new Error('App UI failed to initialize');
  }

  snapSelect.innerHTML = SNAP_STEPS_MM.map((step) => `<option value="${step}">${step} mm</option>`).join('');

  const scene = new PlannerScene(
    viewport,
    (id) => store.setSelectedBoard(id),
    (id, position) => store.moveBoardToPosition(id, position),
  );

  const renderCustomModal = (): void => {
    const previousScrollTop = modalRoot.querySelector<HTMLElement>('.modal-body')?.scrollTop ?? 0;
    const validation = validateCustomBoxConfig(customConfig);
    modalRoot.innerHTML = createCustomGenerationModal(customConfig, validation.errors);
    const modal = modalRoot.querySelector<HTMLElement>('[data-custom-modal]');
    if (!modal) return;

    const modalBody = modal.querySelector<HTMLElement>('.modal-body');
    if (modalBody) modalBody.scrollTop = previousScrollTop;

    modal.querySelectorAll<HTMLElement>('[data-custom-close]').forEach((element) => {
      element.addEventListener('click', () => {
        modalRoot.innerHTML = '';
      });
    });

    const applyCustomNumberValue = (key: string, rawValue: string): void => {
      const value = Number(rawValue);
      if (Number.isNaN(value)) return;

      if (key === 'verticalGapMm' || key === 'horizontalGapMm') {
        customConfig = { ...customConfig, doors: { ...customConfig.doors, [key]: value } };
      } else if (key === 'doorCount') {
        customConfig = { ...customConfig, doors: { ...customConfig.doors, count: value } };
      } else if (key === 'verticalDividerCount') {
        customConfig = { ...customConfig, dividers: { ...customConfig.dividers, verticalCount: value } };
      } else if (key === 'horizontalDividerCount') {
        customConfig = { ...customConfig, dividers: { ...customConfig.dividers, horizontalCount: value } };
      } else if (key === 'frontGapMm') {
        customConfig = { ...customConfig, dividers: { ...customConfig.dividers, frontGapMm: value } };
      } else {
        customConfig = { ...customConfig, [key]: value } as CustomBoxConfig;
      }
    };

    modal.querySelectorAll<HTMLInputElement>('[data-custom-number]').forEach((input) => {
      input.addEventListener('blur', () => {
        applyCustomNumberValue(input.dataset.customNumber as string, input.value);
        renderCustomModal();
      });

      input.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') return;
        applyCustomNumberValue(input.dataset.customNumber as string, input.value);
        renderCustomModal();
      });
    });

    modal.querySelectorAll<HTMLInputElement>('[data-custom-wall]').forEach((input) => {
      input.addEventListener('change', () => {
        const wall = input.dataset.customWall as keyof CustomBoxConfig['walls'];
        customConfig = { ...customConfig, walls: { ...customConfig.walls, [wall]: input.checked } };
        renderCustomModal();
      });
    });

    modal.querySelectorAll<HTMLInputElement>('[data-custom-assembly]').forEach((input) => {
      input.addEventListener('change', () => {
        customConfig = { ...customConfig, assemblyMode: input.value as AssemblyMode };
        renderCustomModal();
      });
    });

    modal.querySelectorAll<HTMLInputElement>('[data-custom-back-mode]').forEach((input) => {
      input.addEventListener('change', () => {
        customConfig = { ...customConfig, backWallMode: input.value as BackWallMode };
        renderCustomModal();
      });
    });

    const doorsEnabled = modal.querySelector<HTMLInputElement>('[data-custom-doors-enabled]');
    doorsEnabled?.addEventListener('change', () => {
      customConfig = { ...customConfig, doors: { ...customConfig.doors, enabled: doorsEnabled.checked } };
      renderCustomModal();
    });


    modal.querySelector<HTMLButtonElement>('[data-custom-confirm]')?.addEventListener('click', () => {
      const latestValidation = validateCustomBoxConfig(customConfig);
      if (!latestValidation.isValid) {
        renderCustomModal();
        return;
      }
      store.generateCustomBox(customConfig);
      modalRoot.innerHTML = '';
    });
  };

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
        case 'custom-generation':
          customConfig = {
            ...customConfig,
            mainThicknessMm: store.getState().project.board_thickness_mm || DEFAULT_BOARD_THICKNESS_MM,
          };
          renderCustomModal();
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

  root.querySelectorAll<HTMLButtonElement>('[data-drag-axis]').forEach((button) => {
    button.addEventListener('pointerdown', (event) => {
      const axis = button.dataset.dragAxis as 'x_mm' | 'y_mm' | 'z_mm';
      const selectedBoardId = store.getState().selectedBoardId;
      if (!selectedBoardId) return;
      event.preventDefault();
      button.setPointerCapture?.(event.pointerId);
      scene.beginAxisDrag(axis, selectedBoardId, event.clientX, event.clientY, store.getState().project.settings.snapStepMm);
    });
  });

  gridToggle.addEventListener('change', () => {
    const current = store.getState().project.settings;
    store.updateProject({ settings: { ...current, gridVisible: gridToggle.checked } });
  });

  snapToggle.addEventListener('change', () => {
    const current = store.getState().project.settings;
    store.updateProject({ settings: { ...current, snapEnabled: snapToggle.checked } });
  });

  snapSelect.addEventListener('change', () => {
    const current = store.getState().project.settings;
    store.updateProject({ settings: { ...current, snapStepMm: Number(snapSelect.value) as 1 | 5 | 10 } });
  });

  transparencyToggle.addEventListener('change', () => {
    const current = store.getState().project.settings;
    store.updateProject({ settings: { ...current, transparencyEnabled: transparencyToggle.checked } });
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
        const value = field.value;
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
            <strong contenteditable="true" data-board-name="${board.id}">${board.name}</strong>
            <span>${board.role}</span>
            <small>${board.width_mm} × ${board.height_mm} × ${board.thickness_mm} mm</small>
          </button>
        `,
      )
      .join('');

    boardList.querySelectorAll<HTMLElement>('[data-board-id]').forEach((element) => {
      element.addEventListener('click', () => store.setSelectedBoard(element.dataset.boardId ?? null));
    });

    boardList.querySelectorAll<HTMLElement>('[data-board-name]').forEach((element) => {
      element.addEventListener('blur', () => {
        const id = element.dataset.boardName;
        if (id) {
          store.updateBoard(id, { name: element.textContent?.trim() || 'Board' });
        }
      });
    });
  };

  store.subscribe((state) => {
    projectNameInput.value = state.project.name;
    projectThicknessInput.value = String(state.project.board_thickness_mm);
    gridToggle.checked = state.project.settings.gridVisible;
    snapToggle.checked = state.project.settings.snapEnabled;
    snapSelect.value = String(state.project.settings.snapStepMm);
    transparencyToggle.checked = state.project.settings.transparencyEnabled;
    renderBoardList(state);
    renderProperties(state.project.boards.find((board) => board.id === state.selectedBoardId));
    scene.setGridVisible(state.project.settings.gridVisible);
    scene.setTransparencyEnabled(state.project.settings.transparencyEnabled);
    scene.renderBoards(state.project.boards, state.selectedBoardId);
  });
  window.addEventListener('beforeunload', () => scene.dispose(), { once: true });
}
