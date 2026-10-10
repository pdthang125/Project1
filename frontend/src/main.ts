import {
  addSurvey,
  deleteDraft,
  deleteSurvey,
  getAllSurveys,
  getDraft,
  resetSyncAttempts,
  saveDraft,
  type Category,
  type Survey,
} from './db';
import {
  getCurrentLocation,
  getNetworkStatus,
  listenNetworkChanges,
  takePhoto,
} from './capacitor-bridge';
import { initSyncListeners, processSyncQueue, type SyncCallbacks } from './sync-queue';
import { registerServiceWorker } from './sw-register';

// DOM references
const form          = document.querySelector<HTMLFormElement>('#survey-form')!;
const steps         = Array.from(document.querySelectorAll<HTMLElement>('.step'));
const networkPill   = document.querySelector<HTMLElement>('#network-pill')!;
const networkLabel  = document.querySelector<HTMLElement>('#network-label')!;
const queueList     = document.querySelector<HTMLElement>('#queue-list')!;
const queueCount    = document.querySelector<HTMLElement>('#queue-count')!;
const draftStatus   = document.querySelector<HTMLElement>('#draft-status')!;
const progressLabel = document.querySelector<HTMLElement>('#progress-label')!;
const progressFill  = document.querySelector<HTMLElement>('#progress-fill')!;
const backBtn       = document.querySelector<HTMLButtonElement>('#back-btn')!;
const nextBtn       = document.querySelector<HTMLButtonElement>('#next-btn')!;
const photoBtn      = document.querySelector<HTMLButtonElement>('#photo-btn')!;
const photoPreview  = document.querySelector<HTMLElement>('#photo-preview')!;
const photoImg      = document.querySelector<HTMLImageElement>('#photo-img')!;
const photoRemove   = document.querySelector<HTMLButtonElement>('#photo-remove')!;
const locationStatus  = document.querySelector<HTMLElement>('#location-status')!;
const starsContainer  = document.querySelector<HTMLElement>('#stars-container')!;
const starsLabel      = document.querySelector<HTMLElement>('#stars-label')!;
const ratingInput     = document.querySelector<HTMLInputElement>('#f-rating')!;
const installBanner   = document.querySelector<HTMLElement>('#install-banner')!;
const installBtn      = document.querySelector<HTMLButtonElement>('#install-btn')!;
const installDismiss  = document.querySelector<HTMLButtonElement>('#install-dismiss')!;
const toastContainer  = document.querySelector<HTMLElement>('#toast-container')!;
const viewModal       = document.querySelector<HTMLElement>('#view-modal');
const viewModalClose  = document.querySelector<HTMLButtonElement>('#view-modal-close');
const viewModalBody   = document.querySelector<HTMLElement>('#view-modal-body');

// Check modal elements
if (!viewModal || !viewModalClose || !viewModalBody) {
  console.error('[Modal] Modal elements not found!', {
    viewModal: !!viewModal,
    viewModalClose: !!viewModalClose,
    viewModalBody: !!viewModalBody
  });
}

// State
let currentStep = 1;
let photoBase64: string | undefined;
let saveTimer: number | undefined;
let currentRating = 0;
let deferredInstallPrompt: Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> } | null = null;

const STAR_LABELS: Record<number, string> = {
  1: '1 sao - Rat te, can sua chua khan cap',
  2: '2 sao - Kem, can bao tri som',
  3: '3 sao - Trung binh, hoat dong duoc',
  4: '4 sao - Tot, it khiem khuyet',
  5: '5 sao - Xuat sac, tinh trang hoan hao',
};

const MAX_VISIBLE_ATTEMPTS = 5;

// Record detail modal
function openRecordDetailModal(record: Survey) {
  if (!viewModal || !viewModalBody) {
    console.error('[Modal] Modal elements not available!');
    showToast('Không thể mở chi tiết bản ghi', 'error');
    return;
  }
  
  const categoryMap: Record<string, string> = {
    Hardware:   'Phần cứng (Hardware)',
    Projector:  'Máy chiếu (Projector)',
    AC:         'Điều hòa (AC)',
    Electrical: 'Điện (Electrical)',
    Furniture:  'Nội thất (Furniture)',
  };

  const stars = '★'.repeat(record.rating) + '☆'.repeat(5 - record.rating);
  const isSynced = record.status === 'SYNCED';
  const isBlocked = !isSynced && (record.syncAttempts ?? 0) >= MAX_VISIBLE_ATTEMPTS;
  
  const statusClass = isSynced ? 'synced' : isBlocked ? 'failed' : 'pending';
  const statusText = isSynced ? 'ĐÃ ĐỒNG BỘ' : isBlocked ? 'THẤT BẠI' : 'CHỜ ĐỒNG BỘ';
  const statusDot = '●';

  const photoSection = record.photoBase64 
    ? `<div class="detail-photo-container">
         <img src="data:image/jpeg;base64,${record.photoBase64}" 
              alt="Ảnh bằng chứng" 
              class="detail-photo"
              title="Nhấn để xem ảnh phóng to"
              tabindex="0">
         <p style="font-size:12px;color:var(--text-muted);margin-top:6px;text-align:center;">🔍 Nhấn vào ảnh để xem kích thước đầy đủ</p>
       </div>`
    : `<div class="detail-photo-empty">
         <span class="detail-photo-empty-icon">📷</span>
         Không có ảnh bằng chứng
       </div>`;

  const locationSection = record.latitude && record.longitude
    ? `<div class="detail-item">
         <span class="detail-label">Tọa độ GPS</span>
         <span class="detail-value">${record.latitude.toFixed(6)}, ${record.longitude.toFixed(6)}</span>
         <a href="https://www.google.com/maps?q=${record.latitude},${record.longitude}" 
            target="_blank" 
            rel="noopener noreferrer"
            class="detail-map-link">
           📍 Mở Google Maps
         </a>
       </div>
       <div class="detail-item">
         <span class="detail-label">Độ chính xác GPS</span>
         <span class="detail-value">${record.locationAccuracy ? `±${record.locationAccuracy.toFixed(1)}m` : 'N/A'}</span>
       </div>`
    : `<div class="detail-item" style="grid-column: 1/-1;">
         <span class="detail-label">Tọa độ GPS</span>
         <span class="detail-value" style="color: var(--text-muted);">Không có dữ liệu GPS (được ghi nhận trong nhà hoặc không có quyền)</span>
       </div>`;

  const syncInfo = !isSynced 
    ? `<div class="detail-item">
         <span class="detail-label">Số lần thử đồng bộ</span>
         <span class="detail-value">${record.syncAttempts ?? 0}/${MAX_VISIBLE_ATTEMPTS}</span>
       </div>`
    : '';

  viewModalBody.innerHTML = `
    <div class="detail-section">
      <h3>Thông tin vị trí</h3>
      <div class="detail-grid">
        <div class="detail-item">
          <span class="detail-label">Tòa nhà</span>
          <span class="detail-value">Tòa ${record.building}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Tầng</span>
          <span class="detail-value">Tầng ${record.floor}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Phòng</span>
          <span class="detail-value">Phòng ${record.room}</span>
        </div>
      </div>
    </div>

    <div class="detail-section">
      <h3>Thông tin khảo sát</h3>
      <div class="detail-grid">
        <div class="detail-item">
          <span class="detail-label">Danh mục</span>
          <span class="detail-value">${categoryMap[record.category] ?? record.category}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Đánh giá</span>
          <span class="detail-value rating">${stars} <span style="font-size:13px;font-weight:600;color:var(--text-secondary)">(${record.rating}/5 sao)</span></span>
        </div>
        <div class="detail-item" style="grid-column: 1/-1;">
          <span class="detail-label">Ghi chú</span>
          <span class="detail-value notes">${record.notes || 'Không có ghi chú'}</span>
        </div>
      </div>
    </div>

    <div class="detail-section">
      <h3>Ảnh bằng chứng</h3>
      ${photoSection}
    </div>

    <div class="detail-section">
      <h3>Thông tin kỹ thuật</h3>
      <div class="detail-grid">
        <div class="detail-item">
          <span class="detail-label">UUID</span>
          <span class="detail-value uuid">${record.uuid}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Thời gian ghi nhận</span>
          <span class="detail-value">${new Date(record.timestamp).toLocaleString('vi-VN')}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Trạng thái đồng bộ</span>
          <span class="detail-status-badge ${statusClass}">${statusDot} ${statusText}</span>
        </div>
        ${syncInfo}
        ${locationSection}
      </div>
    </div>

    <div class="detail-actions">
      ${!isSynced && isBlocked ? `
        <button type="button" class="detail-btn primary detail-action-retry" data-uuid="${record.uuid}">
          ↻ Thử lại đồng bộ
        </button>
      ` : ''}
      <button type="button" class="detail-btn secondary detail-action-export" data-uuid="${record.uuid}">
        💾 Xuất JSON
      </button>
      <button type="button" class="detail-btn danger detail-action-delete" data-uuid="${record.uuid}">
        🗑️ Xóa bản ghi
      </button>
    </div>
  `;

  viewModal.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeRecordDetailModal() {
  if (!viewModal) return;
  viewModal.classList.remove('active');
  document.body.style.overflow = '';
}

// Modal action implementations
async function retryRecordSync(uuid: string) {
  await resetSyncAttempts(uuid);
  closeRecordDetailModal();
  showToast('Đang thử đồng bộ lại...', 'info');
  await renderQueue();
  void processSyncQueue(renderQueue, syncCallbacks);
}

async function exportRecordJSON(uuid: string) {
  const records = await getAllSurveys();
  const record = records.find(r => r.uuid === uuid);
  if (!record) return;

  const json = JSON.stringify(record, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `survey-${record.uuid.slice(0, 8)}-${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Đã xuất bản ghi ra file JSON!', 'success');
}

async function deleteRecordFromModal(uuid: string) {
  if (!confirm('Bạn có chắc muốn xóa bản ghi này không?')) return;
  await deleteSurvey(uuid);
  closeRecordDetailModal();
  showToast('Đã xóa bản ghi.', 'info');
  await renderQueue();
}

// Expose globals for backward compatibility
(window as any).retryRecordSync = retryRecordSync;
(window as any).exportRecordJSON = exportRecordJSON;
(window as any).deleteRecordFromModal = deleteRecordFromModal;

// Modal event delegation
if (viewModalBody) {
  viewModalBody.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const retryBtn = target.closest<HTMLButtonElement>('.detail-action-retry');
    if (retryBtn) {
      const uuid = retryBtn.dataset.uuid!;
      void retryRecordSync(uuid);
      return;
    }
    const exportBtn = target.closest<HTMLButtonElement>('.detail-action-export');
    if (exportBtn) {
      const uuid = exportBtn.dataset.uuid!;
      void exportRecordJSON(uuid);
      return;
    }
    const deleteBtn = target.closest<HTMLButtonElement>('.detail-action-delete');
    if (deleteBtn) {
      const uuid = deleteBtn.dataset.uuid!;
      void deleteRecordFromModal(uuid);
      return;
    }
    const photoImg = target.closest<HTMLImageElement>('.detail-photo');
    if (photoImg) {
      const w = window.open('');
      if (w) {
        w.document.write(`<title>Ảnh bằng chứng</title><body style="margin:0;background:#060d1f;display:flex;align-items:center;justify-content:center;min-height:100vh;"><img src="${photoImg.src}" style="max-width:100%;max-height:100vh;object-fit:contain;"></body>`);
      }
    }
  });
}

// Modal close handlers
if (viewModalClose) {
  viewModalClose.addEventListener('click', closeRecordDetailModal);
}

if (viewModal) {
  viewModal.addEventListener('click', (e) => {
    if (e.target === viewModal) closeRecordDetailModal();
  });
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && viewModal?.classList.contains('active')) {
    closeRecordDetailModal();
  }
});


// Toast
function showToast(message: string, type: 'success' | 'error' | 'info' = 'info', duration = 3500) {
  const icons = { success: 'OK', error: 'LOI', info: 'i' };
  const emojiMap = { success: 'OK', error: 'X', info: 'i' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span class="toast-icon">${emojiMap[type]}</span><span>${message}</span>`;
  toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = 'toastOut 0.3s ease forwards';
    toast.addEventListener('animationend', () => toast.remove());
  }, duration);
}

// Field accessor
function field<T extends HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(name: string): T {
  return form.elements.namedItem(name) as T;
}

// Step rendering
function renderStep() {
  steps.forEach((step, i) => step.classList.toggle('active', i === currentStep - 1));
  progressLabel.textContent = `BUOC ${currentStep}/4`;
  progressFill.style.width = `${currentStep * 25}%`;
  backBtn.disabled = currentStep === 1;
  if (currentStep === 4) {
    nextBtn.textContent = 'Nop bieu mau';
    nextBtn.classList.add('submit-mode');
  } else {
    nextBtn.textContent = 'Tiep theo';
    nextBtn.classList.remove('submit-mode');
  }
  console.log('[Survey] renderStep:', currentStep);
}

// Stars
function renderStars(rating: number) {
  const starBtns = starsContainer.querySelectorAll<HTMLButtonElement>('.star-btn');
  starBtns.forEach((btn) => {
    const val = Number(btn.dataset.value);
    btn.classList.toggle('active', val <= rating);
  });
  starsLabel.textContent = rating > 0 ? (STAR_LABELS[rating] ?? '') : 'Chua chon danh gia';
  ratingInput.value = rating > 0 ? String(rating) : '';
}

starsContainer.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('.star-btn');
  if (!btn) return;
  currentRating = Number(btn.dataset.value);
  renderStars(currentRating);
  scheduleDraft();
});

// Draft data
function draftData() {
  return {
    building: field('building').value,
    floor: field('floor').value,
    room: field('room').value,
    category: field('category').value as Category | '',
    rating: currentRating,
    notes: field('notes').value,
    photoBase64,
    updatedAt: Date.now(),
  };
}

// Auto-save draft
function scheduleDraft() {
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(async () => {
    await saveDraft(draftData());
    draftStatus.textContent = 'Da luu ban nhap';
    setTimeout(() => { draftStatus.textContent = 'San sang'; }, 2000);
  }, 700);
}

// Validation
function markInvalid(el: HTMLElement) {
  el.classList.add('invalid');
  el.addEventListener('input', () => el.classList.remove('invalid'), { once: true });
  el.addEventListener('change', () => el.classList.remove('invalid'), { once: true });
}

function validateStep(step: number): boolean {
  if (step === 1) {
    const buildingEl = field<HTMLInputElement>('building');
    const floorEl   = field<HTMLInputElement>('floor');
    const roomEl    = field<HTMLInputElement>('room');
    const ok = buildingEl.value.trim() && floorEl.value.trim() && roomEl.value.trim();
    if (!ok) {
      if (!buildingEl.value.trim()) markInvalid(buildingEl);
      if (!floorEl.value.trim())    markInvalid(floorEl);
      if (!roomEl.value.trim())     markInvalid(roomEl);
      showToast('Vui long dien day du: Toa nha, Tang, So phong.', 'error');
      return false;
    }
  }
  if (step === 2) {
    const categoryEl = field<HTMLSelectElement>('category');
    if (!categoryEl.value) {
      markInvalid(categoryEl);
      showToast('Vui long chon danh muc thiet bi.', 'error');
      return false;
    }
  }
  if (step === 3) {
    if (currentRating === 0) {
      showToast('Vui long chon danh gia tinh trang (1-5 sao).', 'error');
      return false;
    }
  }
  return true;
}

// Queue render
async function renderQueue() {
  const records = await getAllSurveys();
  const count = records.length;
  queueCount.textContent = `${count} ban ghi`;

  if (count === 0) {
    queueList.innerHTML = `
      <div class="queue-empty">
        <span class="queue-empty-icon">&#128237;</span>
        Chua co bieu mau nao duoc nop.<br>
        <span style="font-size:12px;opacity:.6">Dien bieu mau phia tren de bat dau.</span>
      </div>`;
    return;
  }

  const sorted = [...records].sort((a, b) => b.timestamp - a.timestamp);
  queueList.innerHTML = sorted.map((r) => {
    const stars = '&#9733;'.repeat(r.rating) + '&#9734;'.repeat(5 - r.rating);
    const isSynced  = r.status === 'SYNCED';
    const isBlocked = !isSynced && (r.syncAttempts ?? 0) >= MAX_VISIBLE_ATTEMPTS;
    const categoryMap: Record<string, string> = {
      Hardware:   'Phần cứng (Hardware)',
      Projector:  'Máy chiếu (Projector)',
      AC:         'Điều hòa (AC)',
      Electrical: 'Điện (Electrical)',
      Furniture:  'Nội thất (Furniture)',
    };
    const badge = isSynced
      ? '<span class="status-badge synced">SYNCED</span>'
      : isBlocked
        ? '<span class="status-badge failed">FAILED</span>'
        : '<span class="status-badge pending">PENDING</span>';
    const retryBtn = isBlocked
      ? `<button type="button" class="record-retry" data-uuid="${r.uuid}" title="Thử lại đồng bộ" aria-label="Thử lại đồng bộ">&#8635;</button>`
      : '';
    const attempts = !isSynced
      ? `<span class="record-attempts">${r.syncAttempts ?? 0}/${MAX_VISIBLE_ATTEMPTS}</span>`
      : '';
    return `
      <div class="record-card${isBlocked ? ' blocked' : ''}" 
           data-uuid="${r.uuid}" 
           role="button" 
           tabindex="0" 
           aria-label="Xem chi tiết bản ghi tại Tòa ${r.building} Tầng ${r.floor} Phòng ${r.room}">
        <div class="record-top">
          <div>
            <div class="record-location">Tòa ${r.building} &middot; Tầng ${r.floor} &middot; P.${r.room}</div>
            <div class="record-category">${categoryMap[r.category] ?? r.category}</div>
          </div>
          <div class="record-actions">
            ${badge}
            ${retryBtn}
            <button type="button" class="record-delete" data-uuid="${r.uuid}" title="Xóa bản ghi" aria-label="Xóa bản ghi">&times;</button>
          </div>
        </div>
        <div class="record-meta">
          <span class="record-stars" aria-label="${r.rating} sao">${stars}</span>
          <span class="record-uuid">${r.uuid.slice(0, 8)}&hellip;</span>
          <span class="record-time">${new Date(r.timestamp).toLocaleString('vi-VN')}</span>
          ${attempts}
          <span class="record-hint">Chi tiết &rarr;</span>
        </div>
      </div>`;
  }).join('');

  // View detail handlers (click & keyboard)
  queueList.querySelectorAll<HTMLElement>('.record-card').forEach((card) => {
    const handleOpen = () => {
      const uuid = card.dataset.uuid!;
      const record = sorted.find(r => r.uuid === uuid);
      if (record) {
        openRecordDetailModal(record);
      }
    };

    card.addEventListener('click', (e) => {
      // Don't open modal if clicking on action buttons
      if ((e.target as HTMLElement).closest('.record-delete, .record-retry')) {
        return;
      }
      handleOpen();
    });

    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        if ((e.target as HTMLElement).closest('.record-delete, .record-retry')) {
          return;
        }
        e.preventDefault();
        handleOpen();
      }
    });
  });

  // Delete handlers
  queueList.querySelectorAll<HTMLButtonElement>('.record-delete').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const uuid = btn.dataset.uuid!;
      if (!confirm('Bạn có chắc muốn xóa bản ghi này?')) return;
      await deleteSurvey(uuid);
      showToast('Đã xóa bản ghi.', 'info');
      await renderQueue();
    });
  });

  // Retry handlers
  queueList.querySelectorAll<HTMLButtonElement>('.record-retry').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const uuid = btn.dataset.uuid!;
      await resetSyncAttempts(uuid);
      showToast('Đang thử đồng bộ lại...', 'info');
      await renderQueue();
      void processSyncQueue(renderQueue, syncCallbacks);
    });
  });
}

// Network status
function updateNetworkUI(connected: boolean) {
  networkPill.className = `network-pill ${connected ? 'online' : 'offline'}`;
  networkLabel.textContent = connected ? 'Truc tuyen' : 'Ngoai tuyen';
}

// Sync callbacks
const syncCallbacks: SyncCallbacks = {
  onStart: () => { draftStatus.textContent = 'Dang dong bo...'; },
  onSuccess: () => { showToast('Dong bo thanh cong!', 'success'); },
  onError: (_uuid, error) => {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[Sync] Error:', msg);
    showToast(`Dong bo that bai: ${msg.slice(0, 80)}`, 'error');
  },
  onComplete: async () => {
    draftStatus.textContent = 'San sang';
    await renderQueue();
  },
};

// Photo capture
photoBtn.addEventListener('click', async () => {
  const image = await takePhoto();
  if (image) {
    photoBase64 = image;
    photoImg.src = `data:image/jpeg;base64,${image}`;
    photoPreview.classList.add('has-photo');
    scheduleDraft();
    showToast('Anh da duoc dinh kem.', 'success');
  }
});

photoRemove.addEventListener('click', () => {
  photoBase64 = undefined;
  photoImg.src = '';
  photoPreview.classList.remove('has-photo');
  scheduleDraft();
});

// Reset form
function resetForm() {
  form.reset();
  currentRating = 0;
  renderStars(0);
  photoBase64 = undefined;
  photoImg.src = '';
  photoPreview.classList.remove('has-photo');
  locationStatus.textContent = 'Toa do GPS se duoc ghi lai khi nop bieu mau.';
  locationStatus.className = 'location-status';
  currentStep = 1;
  renderStep();
  draftStatus.textContent = 'San sang';
}

// Submit
async function submit() {
  nextBtn.disabled = true;
  nextBtn.classList.add('submitting');
  draftStatus.textContent = 'Dang lay toa do GPS...';

  try {
    const location = await getCurrentLocation();
    await addSurvey({
      ...draftData(),
      category: field('category').value as Category,
      rating: currentRating,
      ...location,
    });
    await deleteDraft();

    if (location.latitude !== null) {
      locationStatus.textContent = `Da ghi toa do: ${location.latitude.toFixed(5)}, ${location.longitude!.toFixed(5)}`;
      locationStatus.className = 'location-status captured';
    } else {
      locationStatus.textContent = 'Khong lay duoc GPS. Da nop khong co toa do.';
    }

    showToast('Da luu vao hang doi!', 'success');
    await renderQueue();
    void processSyncQueue(renderQueue, syncCallbacks);

    setTimeout(() => resetForm(), 1500);
  } catch (error) {
    console.error('Submit error', error);
    showToast('Loi khi nop bieu mau. Vui long thu lai.', 'error');
  } finally {
    nextBtn.disabled = false;
    nextBtn.classList.remove('submitting');
  }
}

// Navigation
nextBtn.addEventListener('click', () => {
  console.log('[Survey] next clicked, step:', currentStep);
  if (currentStep === 4) {
    void submit();
  } else {
    if (!validateStep(currentStep)) return;
    currentStep++;
    renderStep();
    scheduleDraft();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
});

backBtn.addEventListener('click', () => {
  if (currentStep > 1) {
    currentStep--;
    renderStep();
  }
});

form.addEventListener('input', scheduleDraft);

// PWA Install
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e as typeof deferredInstallPrompt;
  installBanner.classList.remove('hidden');
});

installBtn.addEventListener('click', async () => {
  if (!deferredInstallPrompt) return;
  await deferredInstallPrompt.prompt();
  const { outcome } = await deferredInstallPrompt.userChoice;
  if (outcome === 'accepted') {
    showToast('Ung dung da duoc cai dat!', 'success');
  }
  deferredInstallPrompt = null;
  installBanner.classList.add('hidden');
});

installDismiss.addEventListener('click', () => {
  installBanner.classList.add('hidden');
});

// Boot
async function boot() {
  const draft = await getDraft();
  if (draft) {
    const textFields: Array<'building' | 'floor' | 'room' | 'category' | 'notes'> = [
      'building', 'floor', 'room', 'category', 'notes',
    ];
    for (const name of textFields) {
      const el = form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null;
      if (el) el.value = draft[name];
    }
    if (draft.rating) {
      currentRating = draft.rating;
      renderStars(draft.rating);
    }
    if (draft.photoBase64) {
      photoBase64 = draft.photoBase64;
      photoImg.src = `data:image/jpeg;base64,${draft.photoBase64}`;
      photoPreview.classList.add('has-photo');
    }
    showToast('Da khoi phuc ban nhap tu lan truoc.', 'info');
    draftStatus.textContent = 'Ban nhap da khoi phuc';
  }

  renderStep();
  renderStars(currentRating);
  await renderQueue();

  const status = await getNetworkStatus();
  updateNetworkUI(status.connected);
  await listenNetworkChanges((connected) => {
    updateNetworkUI(connected);
    if (connected) {
      showToast('Ket noi duoc khoi phuc. Dang dong bo...', 'info');
      void processSyncQueue(renderQueue, syncCallbacks);
    } else {
      showToast('Mat ket noi. Du lieu se duoc luu cuc bo.', 'error');
    }
  });

  const registration = await registerServiceWorker();
  if (registration) {
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data?.type === 'TRIGGER_SYNC') {
        void processSyncQueue(renderQueue, syncCallbacks);
      }
    });
  }
  await initSyncListeners(registration, renderQueue, syncCallbacks);
}

void boot();
