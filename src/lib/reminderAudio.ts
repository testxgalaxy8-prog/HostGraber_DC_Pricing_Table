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
    return await Notification.requestPermission();
  } catch {
    return 'unsupported';
  }
}

export function showBrowserReminderNotification(options: {
  title: string;
  body: string;
  tag: string;
  onClick?: () => void;
}): void {
  if (!canUseBrowserNotifications()) return;
  try {
    if (Notification.permission !== 'granted') return;
    const n = new Notification(options.title, {
      body: options.body,
      tag: options.tag,
      requireInteraction: false,
    });
    if (options.onClick) {
      n.onclick = () => {
        try {
          window.focus();
        } catch {
          // ignore
        }
        options.onClick?.();
        n.close();
      };
    }
  } catch {
    // Ignore iframe or browser notification restrictions
  }
}
