import { DBSchema, openDB } from 'idb';

export type SurveyStatus = 'PENDING_SYNC' | 'SYNCED';
export type Category = 'Hardware' | 'Projector' | 'AC' | 'Electrical' | 'Furniture';

export interface SurveyInput {
  building: string;
  floor: string;
  room: string;
  category: Category;
  rating: number;
  notes: string;
  photoBase64?: string;
  latitude: number | null;
  longitude: number | null;
  locationAccuracy: number | null;
}

export interface Survey extends SurveyInput {
  uuid: string;
  timestamp: number;
  status: SurveyStatus;
  syncAttempts?: number;
}

interface FieldSurveyDB extends DBSchema {
  drafts: {
    key: number;
    value: {
      id: number;
      building: string;
      floor: string;
      room: string;
      category: Category | '';
      rating: number;
      notes: string;
      photoBase64?: string;
      updatedAt: number;
    };
  };
  surveys: {
    key: string;
    value: Survey;
    indexes: { 'by-status': SurveyStatus };
  };
}

const dbPromise = openDB<FieldSurveyDB>('vku-field-survey-db', 1, {
  upgrade(db) {
    db.createObjectStore('drafts', { keyPath: 'id', autoIncrement: true });
    const surveys = db.createObjectStore('surveys', { keyPath: 'uuid' });
    surveys.createIndex('by-status', 'status');
  },
});

export async function saveDraft(data: Omit<FieldSurveyDB['drafts']['value'], 'id'> & { id?: number }) {
  return (await dbPromise).put('drafts', { ...data, id: data.id ?? 1 });
}

export async function getDraft() {
  return (await dbPromise).get('drafts', 1);
}

export async function deleteDraft() {
  return (await dbPromise).delete('drafts', 1);
}

export async function addSurvey(data: SurveyInput): Promise<Survey> {
  const record: Survey = {
    ...data,
    uuid: crypto.randomUUID(),
    timestamp: Date.now(),
    status: 'PENDING_SYNC',
    syncAttempts: 0,
  };
  await (await dbPromise).put('surveys', record);
  return record;
}

export async function getAllSurveys() {
  return (await dbPromise).getAll('surveys');
}

export async function getAllPending() {
  return (await dbPromise).getAllFromIndex('surveys', 'by-status', 'PENDING_SYNC');
}

export async function updateSurveyStatus(uuid: string, status: SurveyStatus) {
  const db = await dbPromise;
  const record = await db.get('surveys', uuid);
  if (record) await db.put('surveys', { ...record, status });
}

export async function incrementSyncAttempts(uuid: string) {
  const db = await dbPromise;
  const record = await db.get('surveys', uuid);
  if (record) await db.put('surveys', { ...record, syncAttempts: (record.syncAttempts ?? 0) + 1 });
}

export async function deleteSurvey(uuid: string) {
  return (await dbPromise).delete('surveys', uuid);
}

export async function resetSyncAttempts(uuid: string) {
  const db = await dbPromise;
  const record = await db.get('surveys', uuid);
  if (record) await db.put('surveys', { ...record, syncAttempts: 0, status: 'PENDING_SYNC' });
}