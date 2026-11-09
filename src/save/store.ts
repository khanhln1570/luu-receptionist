import { emptySave, parseSave, type SaveData } from '../core/progress';

const KEY = 'luu-receptionist-save-v1';

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function defaultStorage(): StorageLike | null {
  try {
    return window.localStorage;
  } catch {
    return null; // cửa sổ ẩn danh hoặc bị chặn lưu trữ
  }
}

/** Lưu tiến trình bằng localStorage; mọi lỗi lưu trữ đều bị nuốt để game vẫn chơi được (tiến trình chỉ giữ trong phiên). */
export class SaveStore {
  private memory: SaveData | null = null;

  constructor(private readonly storage: StorageLike | null = defaultStorage()) {}

  load(): SaveData {
    if (this.memory) return this.memory;
    try {
      return parseSave(this.storage?.getItem(KEY) ?? null);
    } catch {
      return emptySave();
    }
  }

  save(data: SaveData): void {
    this.memory = data;
    try {
      this.storage?.setItem(KEY, JSON.stringify(data));
    } catch {
      /* không lưu được: chỉ giữ trong bộ nhớ */
    }
  }

  reset(): void {
    this.memory = emptySave();
    try {
      this.storage?.removeItem(KEY);
    } catch {
      /* bỏ qua */
    }
  }
}
