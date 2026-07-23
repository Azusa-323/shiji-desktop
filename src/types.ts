export type Period = "week" | "month";
export type ThemeMode = "system" | "light" | "dark";

export interface Category {
  id: string;
  name: string;
  color: string;
  sortOrder: number;
  isSystem: boolean;
  durationSeconds?: number;
}

export interface AppUsage {
  id: string;
  stableKey: string;
  name: string;
  executable?: string;
  iconDataUrl?: string;
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  durationSeconds: number;
  lastSeenAt?: string;
}

export interface CategoryUsage extends Category {
  durationSeconds: number;
}

export interface HourSegment {
  categoryId: string;
  color: string;
  seconds: number;
}

export interface HourBucket {
  hour: number;
  totalSeconds: number;
  segments: HourSegment[];
}

export interface CurrentUsage {
  appId: string;
  name: string;
  categoryName: string;
  color: string;
  startedAt: string;
  durationSeconds: number;
}

export interface DashboardData {
  date: string;
  totalSeconds: number;
  comparisonPct: number | null;
  comparisonLabel: string;
  isPaused: boolean;
  current: CurrentUsage | null;
  categories: CategoryUsage[];
  apps: AppUsage[];
  hourly: HourBucket[];
}

export interface DailyUsage {
  date: string;
  label: string;
  totalSeconds: number;
  segments: HourSegment[];
}

export interface HistoryData {
  period: Period;
  startDate: string;
  endDate: string;
  totalSeconds: number;
  dailyAverageSeconds: number;
  comparisonPct: number | null;
  daily: DailyUsage[];
  categories: CategoryUsage[];
  apps: AppUsage[];
}

export interface Settings {
  idleThresholdSeconds: number;
  launchAtLogin: boolean;
  showTray: boolean;
  dailySummary: boolean;
  weekStartsOn: "monday" | "sunday";
  timeFormat: "24h" | "12h";
  theme: ThemeMode;
  onboardingCompleted: boolean;
}

export interface RuntimeStatus {
  isPaused: boolean;
  current: CurrentUsage | null;
  todaySeconds: number;
  lastHeartbeatAt: string | null;
  databasePath: string;
}

export interface CategoryInput {
  id?: string;
  name: string;
  color: string;
}

export interface ClearScope {
  type: "date" | "all";
  date?: string;
}

export interface ExportOptions {
  startDate: string;
  endDate: string;
}

export interface TimewiseApi {
  getDashboard(date: string): Promise<DashboardData>;
  getHistory(period: Period, anchor: string): Promise<HistoryData>;
  getCategories(): Promise<Category[]>;
  getApps(): Promise<AppUsage[]>;
  saveCategory(input: CategoryInput): Promise<Category[]>;
  deleteCategory(id: string): Promise<Category[]>;
  assignCategory(appIds: string[], categoryId: string): Promise<void>;
  getSettings(): Promise<Settings>;
  updateSettings(patch: Partial<Settings>): Promise<Settings>;
  getStatus(): Promise<RuntimeStatus>;
  togglePause(): Promise<RuntimeStatus>;
  exportCsv(options: ExportOptions): Promise<{ canceled: boolean; path?: string }>;
  clearData(scope: ClearScope): Promise<void>;
  completeOnboarding(): Promise<Settings>;
  openDataFolder(): Promise<void>;
  onUpdate(callback: () => void): () => void;
}

declare global {
  interface Window {
    timewise?: TimewiseApi;
  }
}
