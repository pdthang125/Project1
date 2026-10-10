# VKU Field Survey

Ứng dụng khảo sát cơ sở vật chất trường VKU với khả năng hoạt động offline, cho phép ghi nhận thông tin phòng học, thiết bị kèm ghi chú, hình ảnh và vị trí GPS.

## Tổng quan

**VKU Field Survey** là Progressive Web App (PWA) với khả năng đóng gói thành ứng dụng Android native thông qua Capacitor. Ứng dụng được thiết kế theo kiến trúc **offline-first**, đảm bảo người dùng có thể khảo sát và ghi nhận dữ liệu ngay cả khi không có kết nối mạng. Dữ liệu sẽ tự động đồng bộ khi có kết nối trở lại.

### Kiến trúc hệ thống

```text
┌─────────────────────────────────────────────────────────────┐
│  PWA / Capacitor Android App                                │
├─────────────────────────────────────────────────────────────┤
│  Service Worker (cache-first strategy)                      │
│  - App shell caching                                        │
│  - Background Sync API (sync-surveys tag)                   │
├─────────────────────────────────────────────────────────────┤
│  IndexedDB (via idb library)                                │
│  - drafts: Lưu nháp tự động                                 │
│  - surveys: Khảo sát hoàn thành (PENDING_SYNC → SYNCED)     │
├─────────────────────────────────────────────────────────────┤
│  Sync Queue                                                 │
│  - Sequential POST dispatch                                 │
│  - Retry on network failure                                 │
│  - Status tracking (PENDING_SYNC/SYNCED)                    │
└─────────────────────────────────────────────────────────────┘
                          ↓ HTTPS
┌─────────────────────────────────────────────────────────────┐
│  Cloudflare Worker API                                      │
│  - Nhận và xử lý dữ liệu khảo sát                           │
│  - CORS support                                             │
│  - Request validation                                       │
└─────────────────────────────────────────────────────────────┘
```

## Công nghệ & Tính năng

### Frontend Stack
- **HTML5, CSS3, TypeScript** - Ngôn ngữ chính
- **Vite** - Build tool hiện đại, nhanh
- **Service Worker API** - Offline caching & Background Sync
- **IndexedDB** (thông qua `idb`) - Local database
- **Capacitor 7** - Cross-platform native runtime
  - Camera Plugin - Chụp ảnh thiết bị
  - Network Plugin - Phát hiện kết nối mạng
  - Geolocation Plugin - Lấy tọa độ GPS

### Backend Stack
- **Cloudflare Pages** - Static hosting với HTTPS
- **Cloudflare Workers** - Serverless API endpoint

### Tính năng chính

✅ **Form đa bước thông minh**
- Bước 1: Chọn vị trí (tòa nhà, tầng, phòng)
- Bước 2: Phân loại khảo sát
- Bước 3: Đánh giá 1-5 sao
- Bước 4: Ghi chú và chụp ảnh
- Tự động lưu nháp sau mỗi thay đổi

✅ **Offline-first architecture**
- Hoạt động hoàn toàn không cần mạng
- Lưu trữ dữ liệu local với IndexedDB
- Cache app shell cho startup nhanh

✅ **Đồng bộ tự động thông minh**
- Background Sync API (tag: `sync-surveys`)
- Fallback: `window.ononline` event
- Capacitor Network listener cho native app
- Gửi tuần tự, retry tự động khi lỗi

✅ **Dữ liệu khảo sát đầy đủ**
- UUID duy nhất cho mỗi khảo sát
- Timestamp chính xác
- GPS coordinates (optional, không block submit)
- Ảnh chụp (base64 encoded)
- Trạng thái đồng bộ (PENDING_SYNC/SYNCED)

✅ **Android native support**
- Debug APK cho development
- Signed release APK cho production
- Đầy đủ quyền: Camera, Internet, Network State, Location
- Xử lý graceful khi từ chối quyền GPS

## Cấu trúc thư mục

```
project1/
├── frontend/              # PWA frontend
│   ├── src/              # Source code TypeScript
│   │   ├── main.ts       # Entry point, form logic
│   │   ├── db.ts         # IndexedDB wrapper (idb)
│   │   ├── sync-queue.ts # Sync queue manager
│   │   ├── sw-register.ts # Service Worker registration
│   │   └── capacitor-bridge.ts # Native plugins bridge
│   ├── public/           # Static assets
│   │   ├── manifest.json # PWA manifest
│   │   ├── sw.js         # Service Worker
│   │   └── icons/        # App icons
│   ├── android/          # Capacitor Android project
│   ├── dist/             # Build output
│   ├── vite.config.ts    # Vite configuration
│   └── capacitor.config.ts # Capacitor configuration
├── worker/               # Cloudflare Worker API
│   ├── src/
│   │   └── index.ts      # API endpoint
│   └── wrangler.toml     # Worker configuration
├── docs/                 # Tài liệu và báo cáo
│   ├── technical-report.md
│   └── *.png            # Screenshots
└── package.json          # Root package với scripts chính
```

## Hướng dẫn phát triển

### Cài đặt & Chạy local

```sh
# Cài đặt dependencies
npm install

# Type checking (frontend + worker)
npm run typecheck

# Chạy dev server (http://localhost:5173)
npm run dev
```

### Cấu hình API endpoint

Mặc định, app sẽ gọi tới localhost. Để test sync thật với Worker đã deploy:

```sh
# Thiết lập biến môi trường
VITE_API_URL=https://your-worker.workers.dev npm run build

# Hoặc thêm vào frontend/.env
echo VITE_API_URL=https://your-worker.workers.dev > frontend/.env
npm run build
```

**Lưu ý:** Browser app dùng `navigator.onLine` là web fallback; native build dùng Capacitor Network plugin để phát hiện chính xác hơn.

## Triển khai (Deployment)

### Option 1: Cloudflare Pages Dashboard (Khuyến nghị)

1. Tạo project **Pages** mới trên Cloudflare Dashboard
2. Kết nối với GitHub repository này
3. Sử dụng cấu hình sau:

   | Setting | Value |
   |---------|-------|
   | Root directory | `/` |
   | Framework preset | `Vite` (hoặc `None`) |
   | Build command | `npm run build` |
   | Build output directory | `frontend/dist` |
   | Deploy command | `npm run deploy:pages:ci` |

4. Deploy Worker API riêng biệt:
   ```sh
   npm run deploy:worker
   ```

**⚠️ Quan trọng:** 
- **KHÔNG** dùng `npx wrangler deploy` trong Pages deploy command - lệnh đó deploy Worker và gây xung đột cấu hình
- `npm run deploy:pages:ci` chỉ deploy folder `frontend/dist` đã build sẵn
- Pages cung cấp HTTPS tự động (bắt buộc cho Service Worker hoạt động)

### Option 2: CLI Manual Deployment

```sh
# Đăng nhập Cloudflare (chỉ lần đầu)
npx wrangler login

# Deploy Worker API
npm run deploy:worker

# Build frontend và deploy lên Pages
npm run deploy:pages
```

Worker và Pages là hai project riêng biệt. Worker dùng `worker/wrangler.toml`, Pages deploy static files từ `frontend/dist`.

### Kiểm tra deployment

Sau khi deploy thành công:
- Pages URL: `https://vku-field-survey.pages.dev`
- Worker URL: `https://vku-field-survey-api.workers.dev`
- Cập nhật `VITE_API_URL` trong frontend/.env với Worker URL
- Rebuild và redeploy Pages nếu cần thay đổi API endpoint

## Build Android APK Native

### 🎯 Tính năng Native mới tích hợp

**✅ @capacitor/camera** - Chụp ảnh native
- Sử dụng camera device thực tế (không phải browser API)
- Chất lượng ảnh cao với options tùy chỉnh
- Fallback graceful nếu quyền camera bị từ chối

**✅ @capacitor/network** - Giám sát kết nối real-time
- Phát hiện chính xác trạng thái mạng (online/offline)
- Tự động trigger sync khi có kết nối trở lại
- Thay thế `navigator.onLine` không đáng tin cậy trên mobile

**✅ @capacitor/geolocation** - GPS native
- Lấy tọa độ chính xác từ GPS device
- Không block submit nếu quyền location bị từ chối (lưu `null`)

### Quy trình build APK

```sh
# 1. Build frontend assets
npm run build

# 2. Thêm Android platform (chỉ lần đầu)
npx cap add android

# 3. Sync web assets vào Android project
npx cap sync android

# 4. Build APK
cd frontend/android
gradlew.bat assembleDebug        # Debug APK cho testing
gradlew.bat assembleRelease      # Release APK cho production
```

**Output files:**
- Debug: `frontend/android/app/build/outputs/apk/debug/app-debug.apk`
- Release: `frontend/android/app/build/outputs/apk/release/app-release.apk`

### Ký APK cho production (Release Signing)

1. **Tạo keystore** (chỉ lần đầu):
   ```sh
   keytool -genkey -v -keystore my-release-key.keystore -alias my-key-alias -keyalg RSA -keysize 2048 -validity 10000
   ```

2. **Tạo file cấu hình** `frontend/android/keystore.properties`:
   ```properties
   storeFile=../my-release-key.keystore
   storePassword=YOUR_STORE_PASSWORD
   keyAlias=my-key-alias
   keyPassword=YOUR_KEY_PASSWORD
   ```

3. **Cấu hình signing** trong `frontend/android/app/build.gradle`:
   ```gradle
   android {
       signingConfigs {
           release {
               def keystorePropertiesFile = rootProject.file("keystore.properties")
               def keystoreProperties = new Properties()
               keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
               
               keyAlias keystoreProperties['keyAlias']
               keyPassword keystoreProperties['keyPassword']
               storeFile file(keystoreProperties['storeFile'])
               storePassword keystoreProperties['storePassword']
           }
       }
       buildTypes {
           release {
               signingConfig signingConfigs.release
           }
       }
   }
   ```

4. **Build signed APK**:
   ```sh
   cd frontend/android
   gradlew.bat assembleRelease
   ```

5. **Verify APK signature**:
   ```sh
   apksigner verify --print-certs app-release.apk
   ```

**🔒 Bảo mật:** KHÔNG commit keystore file hoặc passwords vào Git. Thêm vào `.gitignore`:
```
*.keystore
keystore.properties
```

### Quyền Android cần thiết

App yêu cầu các quyền sau (đã cấu hình trong `AndroidManifest.xml`):

| Permission | Mục đích | Bắt buộc? |
|------------|----------|-----------|
| `CAMERA` | Chụp ảnh thiết bị | Không* |
| `INTERNET` | Đồng bộ dữ liệu | Có |
| `ACCESS_NETWORK_STATE` | Kiểm tra kết nối | Có |
| `ACCESS_COARSE_LOCATION` | GPS coordinates | Không* |
| `ACCESS_FINE_LOCATION` | GPS chính xác | Không* |

*Nếu bị từ chối, app vẫn hoạt động bình thường (lưu giá trị `null` cho photo/location)

### Test APK trên thiết bị

1. Enable **Developer Options** và **USB Debugging** trên Android device
2. Kết nối device qua USB
3. Install APK:
   ```sh
   adb install frontend/android/app/build/outputs/apk/debug/app-debug.apk
   ```
4. Hoặc copy APK file vào device và install thủ công

## Testing Offline Functionality

### Kịch bản test cơ bản

1. **Truy cập app** - Mở PWA hoặc APK lần đầu (cần mạng để load)
2. **Enable Airplane Mode** - Tắt hoàn toàn kết nối mạng
3. **Submit nhiều surveys** - Điền form và submit (sẽ lưu local với status `PENDING_SYNC`)
4. **Kiểm tra IndexedDB** - Mở DevTools → Application → IndexedDB → `surveys` store
5. **Restore connectivity** - Tắt Airplane Mode
6. **Xác nhận sync tự động**:
   - Status thay đổi từ `PENDING_SYNC` → `SYNCED`
   - Kiểm tra Worker logs: `npx wrangler tail --config worker/wrangler.toml`

### Các cơ chế sync được test

| Cơ chế | Môi trường | Độ tin cậy |
|--------|------------|------------|
| **Background Sync API** (`sync-surveys`) | Chromium (Chrome, Edge) | ⭐⭐⭐ Cao nhất |
| **window.ononline** event | Mọi browser | ⭐⭐ Trung bình |
| **Capacitor Network listener** | Native Android APK | ⭐⭐⭐ Cao |

**Lưu ý:** Background Sync chỉ được hỗ trợ đầy đủ trên Chromium. App implement cả 3 cơ chế để đảm bảo hoạt động trên mọi platform.

### Debug & Monitoring

**Kiểm tra Service Worker:**
```
DevTools → Application → Service Workers
Status: activated
```

**Kiểm tra Background Sync registration:**
```
DevTools → Application → Background Sync
Tag: sync-surveys
```

**Xem Worker logs real-time:**
```sh
npx wrangler tail --config worker/wrangler.toml
```

**Kiểm tra network requests:**
```
DevTools → Network tab
Filter: Fetch/XHR
```

### Các trường hợp edge case

✅ GPS bị từ chối → Lưu `null`, survey vẫn submit  
✅ Camera bị từ chối → Không có ảnh, survey vẫn submit  
✅ Offline lâu dài → Dữ liệu persist trong IndexedDB  
✅ Multiple pending surveys → Gửi tuần tự, không duplicate  
✅ Network timeout → Retry tự động khi có kết nối

## Submission Checklist & Documentation

### 📋 Checklist hoàn thành

- ✅ **Live Demo URL**: Deploy với `npm run deploy:pages`, ghi lại HTTPS URL
- ✅ **GitHub Repository**: Publish publicly với commit history đầy đủ
- ✅ **Technical Report**: Hoàn thành [docs/technical-report.md](docs/technical-report.md)
- ✅ **Screenshots**: Capture các bước A, B, C, D của form
- ✅ **Offline Evidence**: Screenshot queue states (`PENDING_SYNC` → `SYNCED`)
- ✅ **Service Worker**: Screenshot activated SW và registered sync tag
- ✅ **PWA Manifest**: Screenshot theme color và icons
- ✅ **Signed APK**: Build release APK và verify signature
- ✅ **APK on Device**: Screenshot app chạy trên Android device thật
- ✅ **Demo Video**: Video 2-3 phút demo đầy đủ workflow (optional nhưng khuyến nghị)

### 📸 Screenshots cần thiết

Trong `docs/`:
1. `image-1.png` - Form steps (location, category, rating, notes)
2. `image-2.png` - IndexedDB với PENDING_SYNC status
3. `image-3.png` - IndexedDB sau khi sync thành công (SYNCED)
4. `image.png` - Service Worker activated + Background Sync tag
5. Screenshots bổ sung: APK running, manifest, apksigner output

### 🎥 Demo Video Guidelines

**Nội dung video (2-3 phút):**
1. Mở app lần đầu (online)
2. Bật Airplane Mode
3. Submit 2-3 surveys offline
4. Show IndexedDB với PENDING_SYNC
5. Tắt Airplane Mode
6. Show auto sync → SYNCED
7. Kiểm tra Worker logs (optional)

**Upload lên:** YouTube/Google Drive/Loom và thêm URL vào technical report

## 🔧 Scripts cheat sheet

```sh
# Development
npm run dev              # Dev server tại http://localhost:5173
npm run typecheck        # Check TypeScript errors

# Build & Deploy
npm run build            # Build production frontend
npm run deploy:worker    # Deploy Worker API
npm run deploy:pages     # Build + deploy Pages
npm run deploy:pages:ci  # Deploy pre-built dist (CI/CD)

# Capacitor
npx cap sync android     # Sync web assets vào Android
npx cap open android     # Mở Android Studio

# Debugging
npx wrangler tail --config worker/wrangler.toml  # Worker logs
adb logcat | grep -i capacitor                    # Android logs
```

## 🚀 Các cải tiến có thể thực hiện

- [ ] Thêm KV storage cho Worker để lưu surveys lâu dài
- [ ] Implement pull-to-refresh để kiểm tra sync status
- [ ] Dark mode support
- [ ] i18n - Multiple languages (EN/VI)
- [ ] Export surveys to CSV/Excel
- [ ] Photo compression trước khi lưu IndexedDB
- [ ] Push notifications khi sync thành công
- [ ] iOS support với Capacitor

## 📝 License & Credits

**Author:** VKU Student  
**Course:** Mobile & Cross-platform Development  
**Tech Stack:** Vite + TypeScript + Capacitor + Cloudflare

---

**Built with ❤️ using modern web technologies**