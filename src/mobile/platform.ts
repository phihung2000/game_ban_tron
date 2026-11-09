import { Capacitor } from '@capacitor/core';

export const nativePlatform = () => Capacitor.isNativePlatform();
// Trình duyệt tách tài khoản theo tab như cũ; app native giữ đăng nhập qua lần mở lại.
export const roomStorage = (): Storage => nativePlatform() ? window.localStorage : window.sessionStorage;
