import { useEffect, useState } from "react";
import { BarChart3, LayoutDashboard, Pause, Play, Settings as SettingsIcon, Tags } from "lucide-react";
import { api } from "./timewise";
import type { Settings, ThemeMode } from "./types";
import { Onboarding } from "./components/Onboarding";
import { DashboardPage } from "./pages/DashboardPage";
import { HistoryPage } from "./pages/HistoryPage";
import { CategoriesPage } from "./pages/CategoriesPage";
import { SettingsPage } from "./pages/SettingsPage";

type PageId = "dashboard" | "history" | "categories" | "settings";

const navigation = [
  { id: "dashboard" as const, label: "概览", icon: LayoutDashboard },
  { id: "history" as const, label: "历史", icon: BarChart3 },
  { id: "categories" as const, label: "分类", icon: Tags },
  { id: "settings" as const, label: "设置", icon: SettingsIcon },
];

function applyTheme(theme: ThemeMode) {
  const dark = theme === "dark" || (theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}

export default function App() {
  const [page, setPage] = useState<PageId>("dashboard");
  const [settings, setSettings] = useState<Settings | null>(null);
  const [paused, setPaused] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    Promise.all([api.getSettings(), api.getStatus()]).then(([nextSettings, status]) => {
      setSettings(nextSettings);
      setPaused(status.isPaused);
      applyTheme(nextSettings.theme);
    });
    const unsubscribe = api.onUpdate(() => {
      setRefreshKey((value) => value + 1);
      api.getStatus().then((status) => setPaused(status.isPaused));
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (settings) applyTheme(settings.theme);
  }, [settings?.theme]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(""), 3200);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  async function togglePause() {
    const status = await api.togglePause();
    setPaused(status.isPaused);
    setRefreshKey((value) => value + 1);
  }

  async function completeOnboarding() {
    const next = await api.completeOnboarding();
    setSettings(next);
  }

  if (!settings) {
    return <div className="app-loading"><span className="brand-mark">时</span></div>;
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup">
          <span className="brand-mark">时</span>
          <span className="brand-name">时迹</span>
        </div>
        <nav className="primary-nav" aria-label="主导航">
          {navigation.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={page === item.id ? "nav-item nav-item-active" : "nav-item"}
                onClick={() => setPage(item.id)}
                aria-current={page === item.id ? "page" : undefined}
                title={item.label}
              >
                <Icon size={19} strokeWidth={1.8} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="sidebar-bottom">
          <button className={paused ? "tracking-control is-paused" : "tracking-control"} onClick={() => void togglePause()}>
            {paused ? <Play size={17} /> : <Pause size={17} />}
            <span>{paused ? "恢复统计" : "暂停统计"}</span>
          </button>
          <div className="privacy-status"><span /> 本地保存</div>
        </div>
      </aside>

      <main className="main-content">
        {page === "dashboard" && <DashboardPage paused={paused} refreshKey={refreshKey} />}
        {page === "history" && <HistoryPage refreshKey={refreshKey} />}
        {page === "categories" && <CategoriesPage refreshKey={refreshKey} onNotice={setNotice} />}
        {page === "settings" && (
          <SettingsPage
            settings={settings}
            onSettingsChange={(next) => {
              setSettings(next);
              setNotice("设置已保存");
            }}
            onNotice={setNotice}
          />
        )}
      </main>

      {!settings.onboardingCompleted && <Onboarding onComplete={completeOnboarding} />}
      {notice && <div className="toast" role="status">{notice}</div>}
    </div>
  );
}
