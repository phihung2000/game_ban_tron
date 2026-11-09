import type { CapacitorConfig } from '@capacitor/cli';
import { KeyboardResize } from '@capacitor/keyboard';

const config: CapacitorConfig = {
  appId: 'io.github.phihung2000.bantron',
  appName: 'Bàn Tròn 3D',
  webDir: 'dist',
  // localhost giữ secure context cho WebRTC; đóng gói web vào app, không tải code từ URL ngoài.
  server: { hostname: 'localhost', androidScheme: 'https', iosScheme: 'capacitor' },
  android: { allowMixedContent: false, minWebViewVersion: 120 },
  ios: { contentInset: 'never' },
  plugins: { Keyboard: { resize: KeyboardResize.Native, resizeOnFullScreen: true } },
};
export default config;
