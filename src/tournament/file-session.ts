import { signal } from '@angular/core';
import type { Tournament } from './models.js';
import { emptyTournament } from './rules.js';
import { BACKUP_FORMAT, validateImport } from './backup.js';
import { fileConnection } from '../file-connection.js';
interface SaveFileHandle {
  name?: string;
  getFile(): Promise<File>;
  queryPermission?(options: { mode: 'readwrite' }): Promise<PermissionState>;
  createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void> }>;
}
interface FilePickerWindow extends Window {
  showSaveFilePicker?: (options: unknown) => Promise<SaveFileHandle>;
  showOpenFilePicker?: (options: unknown) => Promise<SaveFileHandle[]>;
}

export class TournamentFileSession {
  readonly state = signal<Tournament>(emptyTournament());
  readonly linkedBackup = signal(false);
  readonly fileName = signal('');
  readonly notice = signal('');
  readonly backupError = signal('');
  readonly restoringFile = signal(false);
  readonly closingFile = signal(false);
  private handle: SaveFileHandle | null = null;
  private writeQueue: Promise<void> = Promise.resolve();
  private channel?: BroadcastChannel;
  private savedState: Tournament | null = null;
  private lastContact = 0;
  private heartbeat?: ReturnType<typeof setInterval>;

  constructor() {
    if (!location.hash.startsWith('#projector') && 'indexedDB' in window)
      void this.restoreRememberedFile();
    if (!('BroadcastChannel' in window)) return;
    this.channel = new BroadcastChannel('mixed-doubles-tournament-live');
    this.channel.onmessage = (event) => {
      if (location.hash.startsWith('#projector')) {
        if (event.data?.type === 'state') {
          if (event.data.state) this.state.set(event.data.state as Tournament);
          this.fileName.set(event.data.fileName ?? '');
          this.linkedBackup.set(!!event.data.connected);
          this.lastContact = Date.now();
        }
      } else if (event.data?.type === 'request') {
        this.publishConnection();
      }
    };
    if (location.hash.startsWith('#projector')) {
      this.channel.postMessage({ type: 'request' });
      this.heartbeat = window.setInterval(() => {
        if (Date.now() - this.lastContact > 7000) {
          this.linkedBackup.set(false);
        }
        this.channel?.postMessage({ type: 'request' });
      }, 3000);
    }
  }

  private publishConnection(): void {
    this.channel?.postMessage({
      type: 'state',
      state: this.savedState,
      fileName: this.fileName(),
      connected: this.linkedBackup(),
    });
  }

  private async restoreRememberedFile(): Promise<void> {
    this.restoringFile.set(true);
    try {
      const handle = (await fileConnection()) as SaveFileHandle | undefined;
      if (!handle) return;
      if ((await handle.queryPermission?.({ mode: 'readwrite' })) === 'granted')
        await this.loadHandle(handle);
    } catch (error) {
      this.notice.set(`Letzte Datei konnte nicht automatisch geöffnet werden: ${String(error)}`);
    } finally {
      this.restoringFile.set(false);
    }
  }

  private async loadHandle(handle: SaveFileHandle): Promise<void> {
    const state = validateImport(JSON.parse(await (await handle.getFile()).text()) as unknown);
    await this.writeQueue;
    this.handle = handle;
    this.fileName.set(handle.name ?? 'Turnierdatei');
    this.state.set(state);
    this.savedState = structuredClone(state);
    this.linkedBackup.set(true);
    this.backupError.set('');
    this.publishConnection();
  }

  private async rememberFile(): Promise<void> {
    if (!this.handle || !('indexedDB' in window)) return;
    try {
      await fileConnection(true, this.handle);
    } catch {
      this.notice.set(
        'Die Dateiverbindung konnte nicht gemerkt werden. Beim nächsten Start die Datei erneut öffnen.',
      );
    }
  }

  async closeTournamentFile(): Promise<void> {
    if (this.closingFile()) return;
    this.closingFile.set(true);
    try {
      await this.flushFile();
      if ('indexedDB' in window) await fileConnection(true);
      this.handle = null;
      this.linkedBackup.set(false);
      this.fileName.set('');
      this.state.set(emptyTournament());
      this.savedState = structuredClone(this.state());
      this.notice.set('');
      this.publishConnection();
    } finally {
      this.closingFile.set(false);
    }
  }

  commit(state: Tournament): void {
    if (this.closingFile()) throw new Error('Die Turnierdatei wird gerade geschlossen.');
    if (!this.handle || !this.linkedBackup())
      throw new Error('Bitte zuerst eine Turnierdatei anlegen oder öffnen.');
    this.state.set(state);
    this.queueBackup(state);
  }

  private queueBackup(state: Tournament): void {
    if (!this.handle) return;
    const handle = this.handle;
    const json = this.backupJson(state);
    this.writeQueue = this.writeQueue
      .then(async () => {
        const writer = await handle.createWritable();
        await writer.write(json);
        await writer.close();
        this.savedState = structuredClone(state);
        this.backupError.set('');
      })
      .catch((error) => {
        this.linkedBackup.set(false);
        this.backupError.set(
          `Die Turnierdatei konnte nicht gespeichert werden. Weitere Änderungen sind gesperrt. Bitte den aktuellen Stand in einer neuen Datei sichern, bevor die App geschlossen wird. ${String(error)}`,
        );
      })
      .finally(() => {
        this.publishConnection();
      });
  }

  async flushFile(): Promise<void> {
    await this.writeQueue;
    if (this.backupError()) throw new Error(this.backupError());
  }

  private backupJson(state: Tournament): string {
    return JSON.stringify(
      { format: BACKUP_FORMAT, version: 1, savedAt: new Date().toISOString(), state },
      null,
      2,
    );
  }

  async linkBackupFile(newSession = false): Promise<void> {
    const picker = (window as FilePickerWindow).showSaveFilePicker;
    if (!picker)
      throw new Error(
        'Bitte einen Browser mit direktem Dateizugriff verwenden, zum Beispiel Chrome oder Chromium.',
      );
    await this.writeQueue;
    this.handle = await picker.call(window, {
      suggestedName: 'mixed-doubles-tournament-backup.json',
      types: [{ description: 'JSON-Backup', accept: { 'application/json': ['.json'] } }],
    });
    this.fileName.set(this.handle.name ?? 'Turnierdatei');
    this.linkedBackup.set(true);
    this.backupError.set('');
    this.commit(newSession ? emptyTournament() : this.state());
    await this.writeQueue;
    if (this.backupError()) throw new Error(this.backupError());
    await this.rememberFile();
  }

  async openTournamentFile(): Promise<void> {
    const picker = (window as FilePickerWindow).showOpenFilePicker;
    if (!picker) throw new Error('Dieser Browser unterstützt keinen direkten Dateizugriff.');
    const [handle] = await picker.call(window, {
      types: [{ description: 'Turnierdatei', accept: { 'application/json': ['.json'] } }],
      multiple: false,
    });
    const state = validateImport(JSON.parse(await (await handle.getFile()).text()) as unknown);
    await this.writeQueue;
    this.handle = handle;
    this.fileName.set(handle.name ?? 'Turnierdatei');
    this.linkedBackup.set(true);
    this.backupError.set('');
    this.commit(state);
    await this.flushFile();
    await this.rememberFile();
  }

  destroy(): void {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.channel?.close();
  }
}
