# Giai đoạn 8 — Mobile và phát hành

Mã nguồn: https://github.com/phihung2000/game_ban_tron

Web GitHub Pages: https://phihung2000.github.io/game_ban_tron/

App ID mặc định: `io.github.phihung2000.bantron`. Tên hiển thị: **Bàn Tròn 3D**.
Đổi App ID trước lần đưa lên kho đầu tiên nếu bạn muốn tên miền định danh khác.
Các workflow không tự đăng ứng dụng lên Google Play/App Store, không chứa chứng chỉ ký.

## 1. Chạy trên máy tính

Yêu cầu Node từ 22.12. Nếu Node hiện có là 20, có thể dùng:

```bash
npm install
npm exec --yes --package=node@22 --call "npm run dev"
```

Giữ `.env` hiện tại. Với dự án mới, copy `.env.example` thành `.env`, điền URL/khóa public
Supabase và chạy SQL lần lượt `phase2.sql`, `phase4.sql`, `phase7.sql`.
Giai đoạn 8 không có SQL mới. Tuyệt đối không đưa service_role hoặc secret key vào biến `VITE_`.

## 2. Android

App dùng Android min SDK 26 (Android 8), compile/target SDK 36 và Java 21.
Cần Android Studio phù hợp Capacitor 8, Android SDK 36, Platform Tools và Build Tools.
Cập nhật Android System WebView/Chrome; bản này yêu cầu WebView từ 120 và GPU hỗ trợ WebGL 2.

```bash
npm run mobile:android
```

Lệnh trên build Vite, `cap sync`, rồi mở Android Studio. Trong Android Studio:

1. Chờ Gradle sync; chọn JDK 21 trong Gradle Settings.
2. Cắm thiết bị, bật Developer Options + USB debugging, hoặc chọn emulator có GPU.
3. Bấm Run. Chỉ khi bấm Bật mic mới xin quyền RECORD_AUDIO.
4. Kiểm tra portrait/landscape, bàn phím tiếng Việt, xin/từ chối mic và vào nền/quay lại.

Build bằng CLI khi SDK và Java đã sẵn sàng:

```bash
npm run mobile:sync
cd android
./gradlew assembleDebug
./gradlew bundleRelease
```

APK debug ở `android/app/build/outputs/apk/debug/app-debug.apk`, cài thử được.
AAB mặc định ở `android/app/build/outputs/bundle/release/app-release.aab` **chưa ký phát hành**.
Đưa lên Play cần tạo upload key/Play App Signing, ký AAB trong Android Studio
qua Build → Generate Signed App Bundle / APK. Giữ upload key, mật khẩu và bản sao dự phòng ngoài Git.
Tăng `versionCode` mỗi lần upload; tên phiên bản ở `android/app/build.gradle`.

Manifest đã có INTERNET, RECORD_AUDIO, MODIFY_AUDIO_SETTINGS; microphone không bắt buộc để dùng chat.
Không xin camera hoặc quyền lưu trữ. `usesCleartextTraffic=false`, `adjustResize`, backup tắt.
Capacitor xử lý yêu cầu quyền runtime từ `getUserMedia`, không cần plugin thu âm riêng.

## 3. iOS

Cần macOS, Xcode từ 26 trở lên cho Capacitor 8; dùng bản stable đáp ứng yêu cầu App Store hiện tại.
Project dùng Swift Package Manager, không yêu cầu CocoaPods. App đặt deployment target iOS **17.4**
để dùng thống nhất các API WebRTC/Canvas/AbortSignal hiện có; iPhone/iPad cần phiên bản này hoặc mới hơn.

```bash
npm run mobile:ios
```

Trong Xcode:

1. Mở `ios/App/App.xcodeproj`, chọn scheme App.
2. Chọn Team trong Signing & Capabilities; App ID mặc định phải thuộc quyền đăng ký của bạn.
3. Chọn iPhone thật hoặc simulator rồi Run. Simulator không thay thế bài nghe mic/voice trên thiết bị thật.
4. `Info.plist` đã có `NSMicrophoneUsageDescription` tiếng Việt.
5. Khi phát hành: chọn Any iOS Device → Product → Archive → Organizer → Distribute App.
   Cần Apple Developer Program, App Store Connect, signing/provisioning đúng tài khoản.

Build Simulator không cần tài khoản Apple:

```bash
npm run mobile:sync
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Debug -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' -derivedDataPath artifacts/ios CODE_SIGNING_ALLOWED=NO build
```

Đây là `.app` chạy Simulator, **không phải IPA cài iPhone hay gói để upload App Store**.
Tăng `CURRENT_PROJECT_VERSION` cho mỗi bản upload; chỉnh `MARKETING_VERSION` cho phiên bản hiển thị.

## 4. Giao diện và vòng đời mobile

- Joystick ở góc trái, hướng theo camera, tốc độ analog, có deadzone và giới hạn vòng tròn.
  Thả tay, hủy chạm, đổi app, nhập chat hoặc mở menu đều dừng di chuyển.
- Chạm ghế 3D để ngồi; kéo camera không chọn nhầm ghế. Có nút Đứng dậy khi đang ngồi,
  cùng bảng ghế trong menu để chọn dễ trên màn hình nhỏ.
- Menu phòng mặc định thu gọn trên điện thoại; mic nhanh ở bên phải. Chạm tiêu đề Thiên nhiên để đổi cấu hình.
- Chat dùng VisualViewport và plugin Keyboard, input 16 px, nút tối thiểu 44 px, safe-area cho màn hình tai thỏ.
  Enter/Gửi giữ focus để chat tiếp, Xong đóng bàn phím. Không khóa phóng to trang của người dùng.
- Auto chọn Thấp trên app native/thiết bị cảm ứng; vẫn có thể đổi tay. Auto tiếp tục hạ khi FPS thấp kéo dài.
- Avatar xa dùng 2 mesh đơn giản, bỏ mặt/tay/đồ cầm và animation chi tiết; vẫn giữ vị trí nội suy,
  tên, chat, trạng thái nói. Có hysteresis để tránh đổi model liên tục ở ranh giới LOD.
- Native giữ đăng nhập/khóa phục hồi trong storage của app qua lần mở lại. Web vẫn tách phiên theo tab.
  Logout/rời phòng xóa khóa phục hồi như giai đoạn 7. Khi gỡ app hoặc xóa dữ liệu thì phiên bị mất.
- App vào nền dừng mic và voice, tạm dừng tiếng môi trường. Quay lại thử phục hồi phòng;
  người dùng tự bấm Bật mic lại. Không khai báo thu âm nền hay service micro chạy nền.
- Android Back: đang nhập thì đóng bàn phím; menu đang mở thì đóng menu; ở cảnh thì rời phòng về sảnh.

Đăng nhập email trên native: dùng OTP nhập trong app. Trong Supabase Auth email template,
đưa `{{ .Token }}` vào nội dung email. Nếu muốn Magic Link/Universal Links cần bổ sung deep link
và callback theo tên miền/tài khoản phát hành; bản hiện tại không tự mở app từ Magic Link.
Web cần thêm URL Pages vào Supabase Auth Site URL/Redirect URLs khi dùng link email.

## 5. GitHub Pages và CI

`.github/workflows/web.yml` build/test rồi deploy `dist` lên Pages mỗi lần push `main`.
Vite dùng base tương đối; HDRI cũng tải theo base, chạy được dưới `/game_ban_tron/` và trong app native.
GitHub chỉ giữ hai repository variables public: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`.
Không đưa `.env`, TURN credential dài hạn, token GitHub, keystore hoặc chứng chỉ lên repository.

Thiết lập lại trên repository được cấp quyền, từ `.env` local:

```bash
node scripts/configure-github.mjs phihung2000/game_ban_tron --pages
```

Script chỉ nhận publishable key hoặc JWT anon, không in giá trị. Dùng sau khi repository có branch main.
Pages ở Settings → Pages → Build and deployment → GitHub Actions.

`.github/workflows/native.yml` chạy song song Android và iOS:

- `ban-tron-android`: APK debug để cài thử và AAB chưa ký để hoàn thiện bước ký.
- `ban-tron-ios-simulator`: `.app` Simulator đã nén, không phải bản App Store.

Tải trong GitHub → Actions → Mobile - Android and iOS → run thành công → Artifacts.
CI sử dụng runner Android SDK/JDK 21 và macOS/Xcode; máy local chưa có SDK vẫn lấy được artifact nếu CI thành công.
Đọc trạng thái run thực tế; có file workflow không có nghĩa build đã thành công.

## 6. Kiểm thử

```bash
npm test
npm run check:release
npm run mobile:sync
npm run test:mobile
PEERS=3 npm run test:voice
npm run test:churn
```

`test:mobile` dùng 3 context Chromium, một cảnh 3D với màn hình cảm ứng mô phỏng.
Kiểm tra joystick qua touch events, hủy chạm, vị trí P2P, chat khi VisualViewport co,
tiếng Việt, focus, tap ghế 3D, Auto/Thấp và bố cục dọc/ngang. Bàn phím là mô phỏng viewport,
không phải bàn phím OS thật. Ảnh ở `artifacts/phase8-*.png`.
Backend test là API giả lập + PostgreSQL/WebRTC thật; không xác nhận cấu hình Supabase cloud.
Mic native, Bluetooth, cuộc gọi đến, nhiệt máy và FPS 30 cần kiểm tra Android/iPhone thật.

## 7. Trước khi gửi Google Play và App Store

Các mục dưới đây là việc chủ ứng dụng phải hoàn tất; code/gói debug không đồng nghĩa đã đủ điều kiện duyệt.
Đối chiếu lại chính sách trong console ngay trước ngày gửi.

### Chung

- [ ] Xác nhận App ID, tên app, chủ sở hữu, số phiên bản/build. Thay icon/splash mẫu Capacitor bằng bộ nhận diện của app.
- [ ] Có privacy policy công khai, URL hỗ trợ và thông tin liên hệ thật. Chính sách phải mô tả email/ID,
  hồ sơ, báo cáo, snapshot, giọng nói và thông tin mạng chia sẻ qua WebRTC/STUN/TURN.
- [ ] Có điều khoản sử dụng/quy tắc cộng đồng và luồng chấp nhận phù hợp; chưa có luồng chấp nhận Terms trong bản hiện tại.
- [ ] Có người/quy trình xử lý reports, thời hạn phản hồi và cách khiếu nại. Nút báo cáo không thay thế vận hành kiểm duyệt.
- [ ] Hoàn thiện xóa tài khoản và dữ liệu liên quan trong app cùng trang yêu cầu xóa trên web.
  **Chưa có luồng xóa tài khoản trong bản hiện tại.** Không đưa service_role vào client để làm việc này.
- [ ] Kiểm tra lọc từ, report/block, kick, chống spam với người dùng thật; không quảng cáo là kiểm duyệt hoàn toàn tự động.
- [ ] Dùng TURN production với credential ngắn hạn khi cần NAT traversal. Không thể bảo đảm mọi mạng chỉ bằng STUN.
- [ ] Test mic denied/revoked, đổi thiết bị/Bluetooth, tai nghe, cuộc gọi đến, vào nền, khóa màn hình,
  mất Wi-Fi/đổi sang 4G, chuyển host và phục hồi sau khi OS kill app.
- [ ] Đo FPS/nhiệt/pin trên Android tầm trung và iPhone thật, thử 10 người, xoay màn hình và bàn phím tiếng Việt.
- [ ] Chuẩn bị mô tả, ảnh chụp thiết bị thật, phân loại tuổi, tài khoản/phòng kiểm thử cho reviewer và chỉ dẫn voice.

### Google Play

- [ ] Tài khoản Play Console đã xác minh và quyền sở hữu app.
- [ ] Theo chính sách đang công bố: app mới/update cần target Android 16/API 36 trở lên; project hiện target 36.
  Kiểm tra lại hạn và loại thiết bị ở trang chính sách chính thức khi upload.
- [ ] Ký AAB bằng upload key, bật Play App Signing, giữ key/mật khẩu ngoài Git.
- [ ] Điền Data safety đúng thực tế; audio truyền khỏi thiết bị tới peer vẫn cần đánh giá trong khai báo,
  không tự kết luận “không thu thập dữ liệu” chỉ vì không ghi lên server.
- [ ] Điền URL privacy policy, URL xóa tài khoản/dữ liệu và phân loại nội dung.
- [ ] Với app UGC: lọc/báo cáo/chặn và quy tắc cộng đồng phải dễ tìm, thực sự hoạt động.
- [ ] Hoàn tất internal/closed testing và mọi điều kiện kiểm thử do Play Console áp cho tài khoản của bạn.
- [ ] Kiểm tra cảnh báo Android Vitals, permission mic đúng mục đích và yêu cầu 16 KB nếu sau này thêm thư viện native có `.so`.

### App Store

- [ ] Apple Developer Program, Team, Bundle ID, provisioning và App Store Connect hợp lệ.
- [ ] Từ 28/04/2026 Apple yêu cầu SDK iOS/iPadOS 26 trở lên khi upload; kiểm tra yêu cầu mới trước ngày gửi.
- [ ] Dùng Archive đã ký cho thiết bị, không upload gói Simulator từ CI.
- [ ] Điền App Privacy, App Privacy Manifest/Required Reason API theo SDK/plugin thực dùng,
  giải trình encryption/export compliance dựa trên cấu hình thực tế.
- [ ] Đối chiếu Guideline 1.2: nội dung UGC, report/block/filter/contact và việc sử dụng chat ẩn danh/ngẫu nhiên.
  App chủ yếu phục vụ kiểu Chatroulette/random/anonymous chat có nguy cơ không được chấp nhận;
  cần quyết định mô hình tài khoản/phòng và vận hành kiểm duyệt trước khi gửi. Bản này vẫn có nút vào ẩn danh.
- [ ] Hoàn thiện xóa tài khoản trong app, privacy policy, thông tin hỗ trợ và dữ liệu khai báo.
- [ ] Chạy TestFlight trên iPhone/iPad thật, mic không tự bật lại khi trở về foreground, không xin camera ngoài nhu cầu.
- [ ] Reviewer truy cập được phòng mẫu và backend; App Review Notes giải thích chọn ghế, bật mic, phạm vi nghe và report/block.

Nguồn chính thức:

- [Capacitor 8 — môi trường](https://capacitorjs.com/docs/getting-started/environment-setup)
- [Capacitor Keyboard](https://capacitorjs.com/docs/apis/keyboard), [App lifecycle](https://capacitorjs.com/docs/apis/app)
- [Google Play — target API](https://support.google.com/googleplay/android-developer/answer/11926878)
- [Google Play — UGC](https://support.google.com/googleplay/android-developer/answer/9876937)
- [Google Play — xóa tài khoản](https://support.google.com/googleplay/android-developer/answer/13327111)
- [Apple — SDK từ 28/04/2026](https://developer.apple.com/news/?id=ueeok6yw)
- [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)

## 8. Lỗi thường gặp

| Lỗi | Cách xử lý |
| --- | --- |
| Node 20 / EBADENGINE | Dùng Node từ 22.12 hoặc npm exec --package=node@22. |
| cap command not found | npm ci; dùng npm run mobile:sync hoặc npx cap sau khi Node đúng phiên bản. |
| SDK location not found | Cài SDK qua Android Studio; để IDE tạo android/local.properties, không commit file này. |
| Java 17 / class version | Chọn JDK 21 cho Gradle. |
| xcodebuild chỉ thấy CommandLineTools | Cài Xcode đầy đủ; chọn Developer Directory của Xcode, chấp nhận license trong Xcode. |
| Signing requires a development team | Chọn Team/provisioning; Simulator có thể build với CODE_SIGNING_ALLOWED=NO. |
| Micro không xin quyền | Kiểm tra Manifest/Info.plist, cap sync, cài lại app sau thay native, kiểm tra quyền trong Settings. |
| Không tìm thấy WebGL 2 / WebView cũ | Cập nhật Chrome/Android System WebView; dùng thiết bị có GPU hỗ trợ. |
| Chat bị bàn phím che trên một thiết bị | Ghi model/OS/WebView, kiểm tra adjustResize và Keyboard resize=native; thử xoay màn hình và nút Xong. |
| Web mở nhưng không đăng nhập được | Kiểm tra repository variables, Anonymous Sign-In, SQL/RLS và Auth Redirect URLs trong Supabase. |
| HDRI/JS 404 dưới GitHub Pages | Giữ Vite base tương đối, rebuild/deploy; không đổi đường HDRI thành /assets tuyệt đối. |
| CI build fail | Mở đúng run/log trong Actions; kiểm tra biến public, SDK và phiên bản action. Không coi artifact cũ là bản mới. |
| AAB bị báo unsigned / không cài Simulator app lên iPhone | Ký bản release cho thiết bị theo quy trình tương ứng; artifact CI chưa phải bản Store. |
