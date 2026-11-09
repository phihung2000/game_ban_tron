import { useEffect } from 'react';
import { Keyboard } from '@capacitor/keyboard';
import type { PluginListenerHandle } from '@capacitor/core';
import { nativePlatform } from './platform';

export function keyboardVisible(focused: boolean, fullHeight: number, visibleHeight: number, nativeOpen = false) {
  return nativeOpen || focused && fullHeight - visibleHeight > 120;
}
export function useMobileViewport() {
  useEffect(() => {
    const root = document.documentElement, viewport = window.visualViewport;
    let fullHeight = window.innerHeight, nativeOpen = false, disposed = false, frame = 0;
    const handles: PluginListenerHandle[] = [];
    const update = () => {
      const visibleHeight = viewport?.height ?? window.innerHeight;
      const focused = Boolean(document.activeElement?.matches('input,textarea,[contenteditable="true"]'));
      if (!focused && !nativeOpen) fullHeight = window.innerHeight;
      root.style.setProperty('--app-height', `${Math.round(visibleHeight)}px`);
      root.style.setProperty('--app-offset-top', `${Math.round(viewport?.offsetTop ?? 0)}px`);
      root.dataset.keyboard = keyboardVisible(focused, fullHeight, visibleHeight, nativeOpen) ? 'open' : 'closed';
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(update); };
    update(); viewport?.addEventListener('resize', schedule); viewport?.addEventListener('scroll', schedule);
    window.addEventListener('resize', schedule); document.addEventListener('focusin', schedule); document.addEventListener('focusout', schedule);
    if (nativePlatform()) {
      const show = () => { nativeOpen = true; schedule(); }, hide = () => { nativeOpen = false; schedule(); };
      for (const listener of [Keyboard.addListener('keyboardWillShow', show), Keyboard.addListener('keyboardDidShow', show),
        Keyboard.addListener('keyboardWillHide', hide), Keyboard.addListener('keyboardDidHide', hide)]) {
        void listener.then(handle => {
          if (disposed) void handle.remove(); else handles.push(handle);
        });
      }
    }
    return () => {
      disposed = true; cancelAnimationFrame(frame); handles.forEach(handle => void handle.remove());
      viewport?.removeEventListener('resize', schedule); viewport?.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule); document.removeEventListener('focusin', schedule); document.removeEventListener('focusout', schedule);
      root.style.removeProperty('--app-height'); root.style.removeProperty('--app-offset-top'); delete root.dataset.keyboard;
    };
  }, []);
}
