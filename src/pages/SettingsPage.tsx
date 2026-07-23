import { useEffect, useState } from "react";
import { Database, Download, FolderOpen, ShieldCheck, Trash2 } from "lucide-react";
import { api } from "../timewise";
import type { Settings } from "../types";
import { localDateString, shiftDate } from "../utils";

interface SettingsPageProps {
  settings: Settings;
  onSettingsChange: (settings: Settings) => void;
  onNotice: (message: string) => void;
}

export function SettingsPage({ settings, onSettingsChange, onNotice }: SettingsPageProps) {
  const [statusPath, setStatusPath] = useState("");

  useEffect(() => { api.getStatus().then((status) => setStatusPath(status.databasePath)); }, []);

  async function update(patch: Partial<Settings>) {
    onSettingsChange(await api.updateSettings(patch));
  }

  async function exportCsv() {
    const result = await api.exportCsv({ startDate: shiftDate(localDateString(), -29), endDate: localDateString() });
    if (!result.canceled) onNotice(`已导出到 ${result.path ?? "所选位置"}`);
  }

  async function clearAll() {
    if (!confirm("确定清除全部使用记录？此操作无法撤销。")) return;
    if (!confirm("再次确认：保留分类和设置，仅删除全部时长记录。")) return;
    await api.clearData({ type: "all" });
    onNotice("使用记录已清除");
  }

  return (
    <div className="page settings-page">
      <header className="page-header"><div><p className="eyebrow">偏好</p><h1>设置</h1></div></header>
      <div className="settings-layout">
        <section className="settings-section">
          <div className="settings-heading"><h2>统计</h2></div>
          <div className="setting-row">
            <div><strong>空闲判定</strong><span>达到时长后停止累计</span></div>
            <select value={settings.idleThresholdSeconds} onChange={(event) => void update({ idleThresholdSeconds: Number(event.target.value) })} aria-label="空闲判定时长">
              {[60, 180, 300, 600, 900].map((seconds) => <option key={seconds} value={seconds}>{seconds / 60} 分钟</option>)}
            </select>
          </div>
          <ToggleRow label="开机自动启动" checked={settings.launchAtLogin} onChange={(checked) => void update({ launchAtLogin: checked })} />
          <ToggleRow label="显示系统托盘图标" checked={settings.showTray} onChange={(checked) => void update({ showTray: checked })} />
          <ToggleRow label="每日总结通知" checked={settings.dailySummary} onChange={(checked) => void update({ dailySummary: checked })} />
        </section>

        <section className="settings-section">
          <div className="settings-heading"><h2>显示</h2></div>
          <div className="setting-row"><div><strong>主题</strong></div><div className="segmented-control compact">{(["system", "light", "dark"] as const).map((theme) => <button key={theme} className={settings.theme === theme ? "active" : ""} onClick={() => void update({ theme })}>{theme === "system" ? "跟随系统" : theme === "light" ? "浅色" : "深色"}</button>)}</div></div>
          <div className="setting-row"><div><strong>一周起始日</strong></div><select value={settings.weekStartsOn} onChange={(event) => void update({ weekStartsOn: event.target.value as Settings["weekStartsOn"] })}><option value="monday">星期一</option><option value="sunday">星期日</option></select></div>
          <div className="setting-row"><div><strong>时间格式</strong></div><select value={settings.timeFormat} onChange={(event) => void update({ timeFormat: event.target.value as Settings["timeFormat"] })}><option value="24h">24 小时</option><option value="12h">12 小时</option></select></div>
        </section>

        <section className="settings-section data-section">
          <div className="settings-heading"><h2>数据</h2></div>
          <div className="data-location"><Database size={19} /><div><strong>本地数据库</strong><span title={statusPath}>{statusPath || "正在读取"}</span></div><button className="icon-button" onClick={() => void api.openDataFolder()} title="打开数据文件夹" aria-label="打开数据文件夹"><FolderOpen size={18} /></button></div>
          <div className="data-actions">
            <button className="secondary-button" onClick={() => void exportCsv()}><Download size={17} />导出近 30 天 CSV</button>
            <button className="danger-button" onClick={() => void clearAll()}><Trash2 size={17} />清除全部记录</button>
          </div>
        </section>

        <section className="settings-section privacy-section">
          <div className="settings-heading"><h2>隐私</h2></div>
          <div className="privacy-summary"><ShieldCheck size={24} /><div><strong>数据仅保存在本机</strong><span>不采集窗口标题、键盘内容、文件内容或屏幕画面</span></div></div>
        </section>
      </div>
    </div>
  );
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <div className="setting-row"><div><strong>{label}</strong></div><button role="switch" aria-checked={checked} className={checked ? "toggle active" : "toggle"} onClick={() => onChange(!checked)}><span /></button></div>;
}
