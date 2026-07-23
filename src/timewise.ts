import { getMockCategories, mockDashboard, mockHistory, mockSettings, setMockCategories } from "./mockData";
import type { Category, Settings, TimewiseApi } from "./types";

let previewSettings = { ...mockSettings };
let previewPaused = false;

const previewApi: TimewiseApi = {
  async getDashboard(date) {
    const data = mockDashboard(date);
    data.isPaused = previewPaused;
    if (previewPaused) data.current = null;
    return data;
  },
  async getHistory(period, anchor) {
    return mockHistory(period, anchor);
  },
  async getCategories() {
    return getMockCategories();
  },
  async getApps() {
    return mockDashboard(new Date().toISOString().slice(0, 10)).apps;
  },
  async saveCategory(input) {
    const current = getMockCategories();
    if (input.id) {
      setMockCategories(current.map((item) => (item.id === input.id ? { ...item, ...input } : item)));
    } else {
      const category: Category = {
        id: `custom-${Date.now()}`,
        name: input.name,
        color: input.color,
        isSystem: false,
        sortOrder: current.length,
      };
      setMockCategories([...current, category]);
    }
    return getMockCategories();
  },
  async deleteCategory(id) {
    setMockCategories(getMockCategories().filter((item) => item.id !== id));
    return getMockCategories();
  },
  async assignCategory() {},
  async getSettings() {
    if (new URLSearchParams(location.search).has("onboarding")) {
      return { ...previewSettings, onboardingCompleted: false };
    }
    return { ...previewSettings };
  },
  async updateSettings(patch) {
    previewSettings = { ...previewSettings, ...patch } as Settings;
    return { ...previewSettings };
  },
  async getStatus() {
    const dashboard = mockDashboard(new Date().toISOString().slice(0, 10));
    return {
      isPaused: previewPaused,
      current: previewPaused ? null : dashboard.current,
      todaySeconds: dashboard.totalSeconds,
      lastHeartbeatAt: new Date().toISOString(),
      databasePath: "本地预览模式",
    };
  },
  async togglePause() {
    previewPaused = !previewPaused;
    return this.getStatus();
  },
  async exportCsv() {
    return { canceled: true };
  },
  async clearData() {},
  async completeOnboarding() {
    previewSettings.onboardingCompleted = true;
    return { ...previewSettings };
  },
  async openDataFolder() {},
  onUpdate() {
    return () => undefined;
  },
};

export const api: TimewiseApi = window.timewise ?? previewApi;
export const isDesktop = Boolean(window.timewise);
