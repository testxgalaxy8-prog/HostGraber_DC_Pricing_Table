let sharedAudioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctx) return null;
  if (!sharedAudioCtx) {
    sharedAudioCtx = new Ctx();
  }
  return sharedAudioCtx;
}

export function playReminderChime(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      void ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime;
    const notes = [
      { freq: 587.33, start: 0, dur: 0.16 }, // D5
      { freq: 783.99, start: 0.14, dur: 0.18 }, // G5
      { freq: 987.77, start: 0.28, dur: 0.34 }, // B5
    ];

    for (const note of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(note.freq, now + note.start);

      gain.gain.setValueAtTime(0.0001, now + note.start);
      gain.gain.exponentialRampToValueAtTime(0.14, now + note.start + 0.025);
      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        now + note.start + note.dur
      );

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + note.start);
      osc.stop(now + note.start + note.dur + 0.02);
    }
  } catch {
    // Ignore audio context restrictions if user has not interacted yet
  }
}

export function isEmbeddedIframe(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

export function canUseBrowserNotifications(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function getBrowserNotificationPermission():
  | NotificationPermission
  | 'unsupported' {
  if (!canUseBrowserNotifications()) return 'unsupported';
  try {
    return Notification.permission;
  } catch {
    return 'unsupported';
  }
}

export async function requestBrowserNotificationPermission(): Promise<
  NotificationPermission | 'unsupported'
> {
  if (!canUseBrowserNotifications()) return 'unsupported';
  try {
    const result = await Notification.requestPermission();
    window.dispatchEvent(new Event('hg-notif-permission-changed'));
    return result;
  } catch {
    return getBrowserNotificationPermission();
  }
}

export function showBrowserReminderNotification(options: {
  title: string;
  body: string;
  tag: string;
  requireInteraction?: boolean;
  onClick?: () => void;
}): boolean {
  if (!canUseBrowserNotifications()) return false;
  try {
    if (Notification.permission !== 'granted') return false;
    const n = new Notification(options.title, {
      body: options.body,
      tag: options.tag,
      icon: '/favicon.ico',
      requireInteraction: options.requireInteraction ?? true,
    });
    n.onclick = () => {
      try {
        window.focus();
      } catch {
        // ignore
      }
      options.onClick?.();
      n.close();
    };
    return true;
  } catch {
    return false;
  }
}
