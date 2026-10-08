/**
 * 定时提醒工具
 * - 按可配置的时间点轮询，匹配时播放提示音
 * - 同日已触发去重，午夜自动清除
 * - 配置持久化到 localStorage
 */

export interface ReminderConfig {
  enabled: boolean;
  times: string[];       // HH:MM 格式
  intervalMs: number;    // 轮询间隔
}

const DEFAULT_TIMES = [
  '10:20', '10:50', '11:20',
  '13:20', '13:50', '14:20', '14:50',
];
const DEFAULT_INTERVAL_MS = 5_000;

const CONFIG_KEY = 'trading_reminder_config';
const OLD_ENABLED_KEY = 'trading_reminder_enabled';

// ─── Web Audio 提示音 ────────────────────────────────────────────
let audioCtx: AudioContext | null = null;

function getAudioCtx(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext();
  return audioCtx;
}

/** 在用户手势内调用，解锁音频上下文；否则浏览器自动播放策略会一直挂起导致静音 */
export function primeReminderAudio() {
  try {
    const ctx = getAudioCtx();
    if (ctx.state === 'suspended') void ctx.resume();
  } catch { /* ignore */ }
}

/** 排程提示音（调用前需保证 AudioContext 已处于 running） */
function scheduleBeep(ctx: AudioContext) {
  // 连续播放 3 次，每次间隔 0.8s
  for (let i = 0; i < 3; i++) {
    const offset = i * 0.8;
    const t = ctx.currentTime + offset;
    // 第一声
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(880, t);
    gain1.gain.setValueAtTime(0.3, t);
    gain1.gain.exponentialRampToValueAtTime(0.01, t + 0.25);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(t);
    osc1.stop(t + 0.25);
    // 第二声（稍高，稍延迟）
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1100, t + 0.1);
    gain2.gain.setValueAtTime(0.3, t + 0.1);
    gain2.gain.exponentialRampToValueAtTime(0.01, t + 0.35);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(t + 0.1);
    osc2.stop(t + 0.35);
  }
}

function playBeep() {
  try {
    const ctx = getAudioCtx();
    // 必须等 resume 生效后再排程，否则在 suspended 状态下排程不会发声
    if (ctx.state === 'suspended') {
      ctx.resume().then(() => scheduleBeep(ctx)).catch(() => { /* ignore */ });
    } else {
      scheduleBeep(ctx);
    }
  } catch { /* 静默失败 */ }
}

// ─── 配置读写 ──────────────────────────────────────────────────

export function getReminderConfig(): ReminderConfig {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        enabled: parsed.enabled ?? false,
        times: Array.isArray(parsed.times) && parsed.times.length > 0 ? parsed.times : DEFAULT_TIMES,
        intervalMs: typeof parsed.intervalMs === 'number' && parsed.intervalMs >= 1_000
          ? parsed.intervalMs : DEFAULT_INTERVAL_MS,
      };
    }
  } catch { /* ignore */ }
  // 迁移旧开关状态
  let enabled = false;
  try {
    enabled = localStorage.getItem(OLD_ENABLED_KEY) === 'true';
    if (enabled) localStorage.removeItem(OLD_ENABLED_KEY);
  } catch { /* ignore */ }
  return { enabled, times: DEFAULT_TIMES, intervalMs: DEFAULT_INTERVAL_MS };
}

export function setReminderConfig(config: ReminderConfig) {
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    // 清理旧 key
    localStorage.removeItem(OLD_ENABLED_KEY);
  } catch { /* ignore */ }
}

export function isReminderEnabled(): boolean {
  return getReminderConfig().enabled;
}

// ─── 定时器类 ────────────────────────────────────────────────────
export class ReminderTimer {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private triggered = new Set<string>();
  private lastDate = '';
  private visibilityHandler: (() => void) | null = null;
  private config: ReminderConfig;

  constructor(config?: ReminderConfig) {
    this.config = config ?? getReminderConfig();
  }

  /** 更新配置（需先 stop 再 start 生效） */
  updateConfig(config: ReminderConfig) {
    this.config = config;
  }

  private resetIfNewDay() {
    // 必须用本地日期：触发匹配用的是本地时间，若用 toISOString()（UTC）
    // 会把跨日点落在本地 08:00，导致 00:00–07:59 的时间点 key 错位
    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (this.lastDate !== today) {
      this.triggered.clear();
      this.lastDate = today;
    }
  }

  private check() {
    this.resetIfNewDay();
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const timeStr = `${hh}:${mm}`;

    if (!this.config.times.includes(timeStr)) return;

    const key = `${this.lastDate}_${timeStr}`;
    if (this.triggered.has(key)) return;

    this.triggered.add(key);
    playBeep();
  }

  start() {
    this.stop();
    this.resetIfNewDay();
    this.intervalId = setInterval(() => this.check(), this.config.intervalMs);

    this.visibilityHandler = () => {
      if (document.visibilityState === 'visible') {
        this.check();
      }
    };
    document.addEventListener('visibilitychange', this.visibilityHandler);
  }

  stop() {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.visibilityHandler) {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
      this.visibilityHandler = null;
    }
  }
}
