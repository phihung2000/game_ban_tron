import { useEffect } from 'react';
import { App } from '@capacitor/app';
import { Keyboard } from '@capacitor/keyboard';
import type { PluginListenerHandle } from '@capacitor/core';
import type { RoomSession } from '../network/RoomSession';
import { nativePlatform } from './platform';

export function useMobileRoom(session: RoomSession, onBack: () => void) {
  useEffect(() => {
    if (!nativePlatform()) return;
    let disposed = false; const handles: PluginListenerHandle[] = [];
    const retain = (handle: PluginListenerHandle) => { if (disposed) void handle.remove(); else handles.push(handle); };
    void App.addListener('appStateChange', ({ isActive }) => {
      session.touch.reset();
      if (!isActive) { session.voice.leave(); session.ambience.suspend(); }
      else { session.retryConnections(); session.ambience.resumeIfCreated(); }
    }).then(retain);
    void App.addListener('backButton', () => {
      const active = document.activeElement as HTMLElement | null;
      if (active?.matches('input,textarea,[contenteditable="true"]')) { active.blur(); void Keyboard.hide(); }
      else onBack();
    }).then(retain);
    return () => { disposed = true; handles.forEach(handle => void handle.remove()); session.touch.reset(); };
  }, [session, onBack]);
}
