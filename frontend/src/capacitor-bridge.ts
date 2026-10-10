import { Capacitor } from '@capacitor/core';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Geolocation } from '@capacitor/geolocation';
import { Network } from '@capacitor/network';

export interface SurveyLocation {
  latitude: number | null;
  longitude: number | null;
  locationAccuracy: number | null;
}

/**
 * Capture a photo.
 * - On native (Capacitor): uses the native Camera plugin.
 * - On web: uses a hidden <input type="file" accept="image/*" capture="environment">.
 * Returns a base64 string (without data URI prefix) or null on failure/cancel.
 */
export async function takePhoto(): Promise<string | null> {
  if (Capacitor.isNativePlatform()) {
    try {
      const photo = await Camera.getPhoto({
        resultType: CameraResultType.Base64,
        quality: 70,
        source: CameraSource.Camera,
      });
      return photo.base64String ?? null;
    } catch (error) {
      console.warn('Native camera unavailable', error);
      return null;
    }
  }

  // Web fallback: trigger hidden file input
  return new Promise((resolve) => {
    const input = document.getElementById('camera-input') as HTMLInputElement | null;
    if (!input) { resolve(null); return; }

    const onChange = () => {
      input.removeEventListener('change', onChange);
      const file = input.files?.[0];
      if (!file) { resolve(null); return; }

      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        // Strip "data:image/...;base64," prefix to return raw base64
        const base64 = dataUrl.split(',')[1] ?? null;
        resolve(base64);
        // Reset so the same file can be chosen again
        input.value = '';
      };
      reader.onerror = () => { resolve(null); };
      reader.readAsDataURL(file);
    };

    input.addEventListener('change', onChange);
    input.click();
  });
}

export async function getNetworkStatus() {
  if (Capacitor.isNativePlatform()) {
    return Network.getStatus();
  }
  return { connected: navigator.onLine, connectionType: 'browser' as const };
}

export async function listenNetworkChanges(onChange: (connected: boolean) => void) {
  if (Capacitor.isNativePlatform()) {
    await Network.addListener('networkStatusChange', (status) => onChange(status.connected));
  } else {
    window.addEventListener('online', () => onChange(true));
    window.addEventListener('offline', () => onChange(false));
  }
}

export async function getCurrentLocation(): Promise<SurveyLocation> {
  try {
    const position = await Geolocation.getCurrentPosition({
      enableHighAccuracy: true,
      timeout: 10000,
    });
    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      locationAccuracy: position.coords.accuracy,
    };
  } catch (error) {
    console.warn('Location unavailable; submitting without coordinates', error);
    return { latitude: null, longitude: null, locationAccuracy: null };
  }
}