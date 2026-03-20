import { createBoard, createEmptyProject, projectFromJson, projectToJson, type Board, type Orientation, type Project } from '../domain/model';
import { sampleProjectJson } from '../assets/sampleProject';

export interface AppState {
  project: Project;
  selectedBoardId: string | null;
}

export type Listener = (state: AppState) => void;

function cloneState(state: AppState): AppState {
  return {
    project: JSON.parse(JSON.stringify(state.project)) as Project,
    selectedBoardId: state.selectedBoardId,
  };
}

export class PlannerStore {
  private state: AppState;
  private listeners = new Set<Listener>();

  constructor() {
    const project = projectFromJson(sampleProjectJson);
    this.state = {
      project,
      selectedBoardId: project.boards[0]?.id ?? null,
    };
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => this.listeners.delete(listener);
  }

  getState(): AppState {
    return cloneState(this.state);
  }

  private emit(): void {
    const snapshot = this.getState();
    this.listeners.forEach((listener) => listener(snapshot));
  }

  private mutate(mutator: (state: AppState) => void): void {
    mutator(this.state);
    this.emit();
  }

  getSelectedBoard(): Board | undefined {
    return this.state.project.boards.find((board) => board.id === this.state.selectedBoardId);
  }

  setSelectedBoard(id: string | null): void {
    this.mutate((state) => {
      state.selectedBoardId = id;
    });
  }

  addBoard(): void {
    this.mutate((state) => {
      const board = createBoard(
        {
          name: `Board ${state.project.boards.length + 1}`,
          x_mm: state.project.settings.snapStepMm * state.project.boards.length,
          y_mm: 200,
          z_mm: state.project.settings.snapStepMm * state.project.boards.length,
        },
        state.project.board_thickness_mm,
      );
      state.project.boards.push(board);
      state.selectedBoardId = board.id;
    });
  }

  duplicateSelectedBoard(): void {
    const selected = this.getSelectedBoard();
    if (!selected) return;
    this.mutate((state) => {
      const clone = createBoard(
        {
          ...selected,
          id: undefined,
          name: `${selected.name} Copy`,
          x_mm: selected.x_mm + state.project.settings.snapStepMm,
          z_mm: selected.z_mm + state.project.settings.snapStepMm,
        },
        state.project.board_thickness_mm,
      );
      state.project.boards.push(clone);
      state.selectedBoardId = clone.id;
    });
  }

  deleteSelectedBoard(): void {
    const selectedId = this.state.selectedBoardId;
    if (!selectedId) return;
    this.mutate((state) => {
      state.project.boards = state.project.boards.filter((board) => board.id !== selectedId);
      state.selectedBoardId = state.project.boards[0]?.id ?? null;
    });
  }

  updateProject(partial: Partial<Project>): void {
    this.mutate((state) => {
      state.project = { ...state.project, ...partial };
    });
  }

  updateBoard(id: string, partial: Partial<Board>): void {
    this.mutate((state) => {
      const board = state.project.boards.find((item) => item.id === id);
      if (!board) return;
      Object.assign(board, partial);
    });
  }

  moveSelectedBoard(axis: 'x_mm' | 'y_mm' | 'z_mm', delta: number): void {
    const selected = this.getSelectedBoard();
    if (!selected) return;
    this.updateBoard(selected.id, { [axis]: selected[axis] + delta } as Pick<Board, typeof axis>);
  }

  setOrientation(id: string, orientation: Orientation): void {
    this.updateBoard(id, { orientation });
  }

  loadSampleProject(): void {
    this.mutate((state) => {
      state.project = projectFromJson(sampleProjectJson);
      state.selectedBoardId = state.project.boards[0]?.id ?? null;
    });
  }

  newProject(): void {
    this.mutate((state) => {
      state.project = createEmptyProject();
      state.selectedBoardId = state.project.boards[0]?.id ?? null;
    });
  }

  saveToFile(): void {
    const blob = new Blob([projectToJson(this.state.project)], { type: 'application/json' });
    const anchor = document.createElement('a');
    anchor.href = URL.createObjectURL(blob);
    anchor.download = `${this.state.project.name.toLowerCase().replace(/\s+/g, '-') || 'project'}.json`;
    anchor.click();
    URL.revokeObjectURL(anchor.href);
  }

  async loadFromFile(file: File): Promise<void> {
    const text = await file.text();
    const project = projectFromJson(text);
    this.mutate((state) => {
      state.project = project;
      state.selectedBoardId = project.boards[0]?.id ?? null;
    });
  }
}
