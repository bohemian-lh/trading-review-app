/**
 * 定时提醒工具
 * - 每 5 秒轮询当前时间，匹配预设时间点播放提示音
 * - 同日已触发去重，午夜自动清除
 * - 开关状态持久化到 localStorage
 */

const TARGET_TIMES = [
  '10:20', '10:50', '11:20',
  '13:20', '13:50', '14:20', '14:50',
];

const CHECK_INTERVAL = 5_000; // 5 秒轮询
const STORAGE_KEY = 'trading_reminder_enabled';

// ─── Web Audio 提示音 ────────────────────────────────────────────
let audioCtx: AudioContext | null = null;

function getAudioCtx(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext();
  return audioCtx;
}

function playBeep() {
  try {
    const ctx = getAudioCtx();
    // 浏览器可能暂停 AudioContext（需用户交互后才允许播放）
    if (ctx.state === 'suspended') {
      ctx.resume();
    }
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime); // A5
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.3);
    // 第二声
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1100, ctx.currentTime + 0.15);
    gain2.gain.setValueAtTime(0.3, ctx.currentTime + 0.15);
    gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.45);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(ctx.currentTime + 0.15);
    osc2.stop(ctx.currentTime + 0.45);
  } catch {
    // 静默失败（浏览器的自动播放策略可能阻止）
  }
}

// ─── 定时器类 ────────────────────────────────────────────────────
export class ReminderTimer {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private triggered = new Set<string>(); // "2025-01-15_10:20"
  private lastDate = ''; // 用于检测跨日
  private visibilityHandler: (() => void) | null = null;

  /** 检查并清理跨日的已触发记录 */
  private resetIfNewDay() {
    const today = new Date().toISOString().slice(0, 10); // "2025-01-15"
    if (this.lastDate !== today) {
      this.triggered.clear();
      this.lastDate = today;
    }
  }

  /** 检查当前时间是否匹配目标时间 */
  private check() {
    this.resetIfNewDay();
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const timeStr = `${hh}:${mm}`;

    if (!TARGET_TIMES.includes(timeStr)) return;

    const key = `${this.lastDate}_${timeStr}`;
    if (this.triggered.has(key)) return; // 今天已触发

    this.triggered.add(key);
    playBeep();
  }

  /** 启动定时器 */
  start() {
    this.stop();
    this.resetIfNewDay();
    this.intervalId = setInterval(() => this.check(), CHECK_INTERVAL);

    // 页面恢复可见时立即检测（避免后台节流错过窗口）
    this.visibilityHandler = () => {
      if (document.visibilityState === 'visible') {
        this.check();
      }
    };
    document.addEventListener('visibilitychange', this.visibilityHandler);
  }

  /** 停止定时器 */
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

// ─── 开关持久化 ──────────────────────────────────────────────────
export function isReminderEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setReminderEnabled(enabled: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, String(enabled));
  } catch { /* ignore */ }
}
