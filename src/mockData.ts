import type {
  AppUsage,
  Category,
  DashboardData,
  HistoryData,
  Period,
  Settings,
} from "./types";

export const defaultCategories: Category[] = [
  { id: "study", name: "学习", color: "#28785d", sortOrder: 0, isSystem: true },
  { id: "work", name: "工作", color: "#3d6dcc", sortOrder: 1, isSystem: true },
  { id: "game", name: "游戏", color: "#e05b47", sortOrder: 2, isSystem: true },
  { id: "entertainment", name: "娱乐", color: "#e2a526", sortOrder: 3, isSystem: true },
  { id: "social", name: "社交", color: "#9b62ad", sortOrder: 4, isSystem: true },
  { id: "tools", name: "工具", color: "#64726d", sortOrder: 5, isSystem: true },
  { id: "uncategorized", name: "未分类", color: "#929996", sortOrder: 6, isSystem: true },
];

const appTemplates = [
  ["vscode", "Visual Studio Code", "study", 6180],
  ["chrome", "Google Chrome", "work", 4620],
  ["word", "Microsoft Word", "study", 3480],
  ["figma", "Figma", "work", 2560],
  ["wechat", "微信", "social", 1780],
  ["terminal", "Windows Terminal", "tools", 1310],
  ["steam", "Steam", "game", 820],
] as const;

let categories = [...defaultCategories];

function seedFor(value: string) {
  return [...value].reduce((seed, char) => (seed * 31 + char.charCodeAt(0)) >>> 0, 17);
}

function variance(seed: number, index: number) {
  return 0.72 + (((seed >> (index % 12)) + index * 23) % 57) / 100;
}

function appsFor(date: string): AppUsage[] {
  const seed = seedFor(date);
  return appTemplates
    .map(([id, name, categoryId, duration], index) => {
      const category = categories.find((item) => item.id === categoryId) ?? categories.at(-1)!;
      return {
        id,
        stableKey: `demo://${id}`,
        name,
        executable: `${name}.exe`,
        categoryId,
        categoryName: category.name,
        categoryColor: category.color,
        durationSeconds: Math.round(duration * variance(seed, index)),
      };
    })
    .sort((a, b) => b.durationSeconds - a.durationSeconds);
}

function localDate() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

export function mockDashboard(date: string): DashboardData {
  const apps = appsFor(date);
  const categoryUsage = categories
    .map((category) => ({
      ...category,
      durationSeconds: apps
        .filter((app) => app.categoryId === category.id)
        .reduce((sum, app) => sum + app.durationSeconds, 0),
    }))
    .filter((category) => category.durationSeconds > 0);
  const totalSeconds = apps.reduce((sum, app) => sum + app.durationSeconds, 0);
  const activeHours = [8, 9, 10, 11, 13, 14, 15, 16, 19, 20, 21];
  const hourly = Array.from({ length: 24 }, (_, hour) => {
    if (!activeHours.includes(hour)) return { hour, totalSeconds: 0, segments: [] };
    const weight = 0.48 + ((seedFor(`${date}-${hour}`) % 50) / 100);
    const seconds = Math.round((totalSeconds / activeHours.length) * weight);
    const primary = hour < 12 ? categoryUsage[0] : categoryUsage[(hour + 1) % Math.min(3, categoryUsage.length)];
    const secondary = categoryUsage[(categoryUsage.indexOf(primary) + 1) % categoryUsage.length];
    const first = Math.round(seconds * 0.7);
    return {
      hour,
      totalSeconds: seconds,
      segments: [
        { categoryId: primary.id, color: primary.color, seconds: first },
        { categoryId: secondary.id, color: secondary.color, seconds: seconds - first },
      ],
    };
  });
  return {
    date,
    totalSeconds,
    comparisonPct: -12,
    comparisonLabel: "较昨日",
    isPaused: false,
    current:
      date === localDate()
        ? {
            appId: apps[0].id,
            name: apps[0].name,
            categoryName: apps[0].categoryName,
            color: apps[0].categoryColor,
            startedAt: new Date(Date.now() - 17 * 60_000).toISOString(),
            durationSeconds: 17 * 60,
          }
        : null,
    categories: categoryUsage,
    apps,
    hourly,
  };
}

function shiftDate(date: string, days: number) {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() + days);
  return value.toISOString().slice(0, 10);
}

export function mockHistory(period: Period, anchor: string): HistoryData {
  const days = period === "week" ? 7 : 30;
  const points = Array.from({ length: days }, (_, index) => {
    const date = shiftDate(anchor, index - days + 1);
    const dashboard = mockDashboard(date);
    const dateValue = new Date(`${date}T12:00:00`);
    return {
      date,
      label: period === "week" ? "日一二三四五六"[dateValue.getDay()] : String(dateValue.getDate()),
      totalSeconds: dashboard.totalSeconds,
      segments: dashboard.categories.map((category) => ({
        categoryId: category.id,
        color: category.color,
        seconds: category.durationSeconds,
      })),
    };
  });
  const totalSeconds = points.reduce((sum, point) => sum + point.totalSeconds, 0);
  const apps = appsFor(anchor).map((app) => ({ ...app, durationSeconds: app.durationSeconds * days }));
  const categoryUsage = categories
    .map((category) => ({
      ...category,
      durationSeconds: apps.filter((app) => app.categoryId === category.id).reduce((sum, app) => sum + app.durationSeconds, 0),
    }))
    .filter((category) => category.durationSeconds > 0);
  return {
    period,
    startDate: points[0].date,
    endDate: points.at(-1)!.date,
    totalSeconds,
    dailyAverageSeconds: Math.round(totalSeconds / days),
    comparisonPct: 8,
    daily: points,
    categories: categoryUsage,
    apps,
  };
}

export function getMockCategories() {
  return [...categories];
}

export function setMockCategories(next: Category[]) {
  categories = next;
}

export const mockSettings: Settings = {
  idleThresholdSeconds: 300,
  launchAtLogin: false,
  showTray: true,
  dailySummary: false,
  weekStartsOn: "monday",
  timeFormat: "24h",
  theme: "system",
  onboardingCompleted: true,
};
