export const REPORT_REASONS = { spam: 'Spam', abuse: 'Ngôn từ xúc phạm', harassment: 'Quấy rối', other: 'Khác' } as const;
export type ReportReason = keyof typeof REPORT_REASONS;
export type ModerationFlags = { muted: boolean; blocked: boolean };
export class LocalModeration {
  private values: Record<string, ModerationFlags> = {};
  constructor(private owner: string) {
    try {
      const saved = JSON.parse(localStorage.getItem(`ban-tron-moderation:${owner}`) || '{}');
      if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
        for (const [id, flags] of Object.entries(saved).slice(-512)) {
          if (/^[a-f0-9-]{36}$/i.test(id) && flags && typeof flags === 'object') {
            const f = flags as ModerationFlags; this.values[id] = { muted: f.muted === true, blocked: f.blocked === true };
          }
        }
      }
    } catch { /* Bộ nhớ riêng tư không làm hỏng phiên chơi. */ }
  }
  get(user: string): ModerationFlags { return this.values[user] ?? { muted: false, blocked: false }; }
  set(user: string, field: keyof ModerationFlags, value: boolean) {
    this.values = { ...this.values, [user]: { ...this.get(user), [field]: value } };
    const entries = Object.entries(this.values).filter(([, f]) => f.muted || f.blocked).slice(-512);
    this.values = Object.fromEntries(entries);
    try { localStorage.setItem(`ban-tron-moderation:${this.owner}`, JSON.stringify(this.values)); } catch { /* Vẫn dùng trong phiên hiện tại. */ }
  }
}
