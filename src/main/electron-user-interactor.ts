import { BrowserWindow, ipcMain } from 'electron'
import * as crypto from 'crypto'
import { UserInteractor, ConflictResolutionChoice } from '@core'
import { Document } from '@shared'

/**
 * Concrete Electron implementation of the UserInteractor port.
 * Bridges domain-layer prompts to renderer-side React modal dialogs
 * via IPC events. Each call is one-shot: a unique ID prevents
 * race conditions when multiple files are opened in quick succession.
 */
export class ElectronUserInteractor implements UserInteractor {
  private win: BrowserWindow | null = null

  /** Must be called once the BrowserWindow is created so IPC sends can work. */
  setWindow(win: BrowserWindow): void {
    this.win = win
  }

  /**
   * Sends a single-candidate prompt to the renderer and waits for the user's choice.
   * Resolves to 'CANCEL' immediately if the window is not available.
   */
  async promptSingleCandidate(
    localPath: string,
    candidate: Document
  ): Promise<'OPEN_DRIVE' | 'IMPORT_NEW' | 'CANCEL'> {
    if (!this.win) return 'CANCEL'
    return new Promise((resolve) => {
      const id = crypto.randomUUID()
      this.win!.webContents.send('prompt-single-candidate', { id, localPath, candidate })
      ipcMain.once(`prompt-single-candidate-response-${id}`, (_, response) => {
        resolve(response)
      })
    })
  }

  /**
   * Sends a multi-candidate picker to the renderer and waits for the user's choice.
   * Resolves to CANCEL immediately if the window is not available.
   */
  async promptMultipleCandidates(
    localPath: string,
    candidates: Document[]
  ): Promise<
    { action: 'OPEN_DRIVE'; selected: Document } | { action: 'IMPORT_NEW' } | { action: 'CANCEL' }
  > {
    if (!this.win) return { action: 'CANCEL' }
    return new Promise((resolve) => {
      const id = crypto.randomUUID()
      this.win!.webContents.send('prompt-multiple-candidates', { id, localPath, candidates })
      ipcMain.once(`prompt-multiple-candidates-response-${id}`, (_, response) => {
        resolve(response)
      })
    })
  }

  /**
   * Sends a 6-option conflict resolution dialog to the renderer.
   * Resolves to CANCEL immediately if the window is not available.
   */
  async promptConflict(localPath: string, document: Document): Promise<ConflictResolutionChoice> {
    if (!this.win) return 'CANCEL'
    return new Promise((resolve) => {
      const id = crypto.randomUUID()
      this.win!.webContents.send('prompt-conflict', { id, localPath, document })
      ipcMain.once(`prompt-conflict-response-${id}`, (_, response) => {
        resolve(response)
      })
    })
  }
}
