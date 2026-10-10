import { getAllPending, incrementSyncAttempts, updateSurveyStatus } from './db';

export const API_URL = `${import.meta.env.VITE_API_URL ?? 'https://vku-field-survey-api.workers.dev'}/api/surveys`;

const MAX_SYNC_ATTEMPTS = 5;

export interface SyncCallbacks {
  onStart?: () => void;
  onSuccess?: (uuid: string) => void;
  onError?: (uuid: string, error: unknown) => void;
  onComplete?: () => void;
}

export async function processSyncQueue(
  onChange?: () => void,
  callbacks?: SyncCallbacks
) {
  const pending = await getAllPending();
  if (pending.length === 0) return;

  callbacks?.onStart?.();

  let anyError = false;

  for (const record of pending) {
    // Skip records that have exceeded max retry attempts (silently)
    if ((record.syncAttempts ?? 0) >= MAX_SYNC_ATTEMPTS) continue;

    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(record),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      await updateSurveyStatus(record.uuid, 'SYNCED');
      callbacks?.onSuccess?.(record.uuid);
      onChange?.();
    } catch (error) {
      await incrementSyncAttempts(record.uuid);
      callbacks?.onError?.(record.uuid, error);
      console.warn('[Sync] Failed for', record.uuid, error);
      anyError = true;
    }
  }

  callbacks?.onComplete?.();
  return { anyError };
}

export async function initSyncListeners(
  registration: ServiceWorkerRegistration | null,
  onChange?: () => void,
  callbacks?: SyncCallbacks
) {
  window.ononline = () => {
    void processSyncQueue(onChange, callbacks);
  };

  if (registration && 'sync' in registration) {
    try {
      await (registration as ServiceWorkerRegistration & {
        sync: { register(tag: string): Promise<void> };
      }).sync.register('sync-surveys');
    } catch (error) {
      console.warn('Background Sync unavailable', error);
    }
  }

  if (navigator.onLine) void processSyncQueue(onChange, callbacks);
}