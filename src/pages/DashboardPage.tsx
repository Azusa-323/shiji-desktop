import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Clock3, PauseCircle } from "lucide-react";
import { AppIcon } from "../components/AppIcon";
import { api } from "../timewise";
import type { DashboardData } from "../types";
import { dateLabel, formatDuration, localDateString, shiftDate } from "../utils";

interface DashboardPageProps {
  paused: boolean;
  refreshKey: number;
}

export function DashboardPage({ paused, refreshKey }: DashboardPageProps) {
  const today = localDateString();
  const [date, setDate] = useState(today);
  const [data, setData] = useState<DashboardData | null>(null);

  useEffect(() => {
    setData(null);
    api.getDashboard(date).then(setData);
  }, [date, refreshKey]);

  const donut = useMemo(() => {
    if (!data?.totalSeconds) return "var(--border-strong)";
    let cursor = 0;
    const segments = data.categories.map((category) => {
      const start = cursor;
      cursor += (category.durationSeconds / data.totalSeconds) * 100;
      return `${category.color} ${start}% ${cursor}%`;
    });
    return `conic-gradient(${segments.join(",")})`;
  }, [data]);

  if (!data) return <PageLoading />;
  const maxHour = Math.max(...data.hourly.map((item) => item.totalSeconds), 1);
  const currentPaused = paused || data.isPaused;

  return (
    <div className="page dashboard-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">{date === today ? "今天" : "历史日期"}</p>
          <h1>{date === today ? "今日概览" : dateLabel(date)}</h1>
        </div>
        <div className="date-control">
          <button className="icon-button" onClick={() => setDate(shiftDate(date, -1))} title="前一天" aria-label="前一天"><ChevronLeft size={19} /></button>
          <input aria-label="选择日期" type="date" value={date} max={today} onChange={(event) => setDate(event.target.value)} />
          <button className="icon-button" disabled={date >= today} onClick={() => setDate(shiftDate(date, 1))} title="后一天" aria-label="后一天"><ChevronRight size={19} /></button>
        </div>
      </header>

      {currentPaused && date === today && (
        <div className="pause-banner"><PauseCircle size={18} /><strong>统计已暂停</strong><span>恢复后将从当前时刻继续记录</span></div>
      )}

      <section className="dashboard-summary" aria-label="今日摘要">
        <div className="total-block">
          <p className="section-label">总使用时长</p>
          <div className="total-time">{formatDuration(data.totalSeconds)}</div>
          <div className={data.comparisonPct !== null && data.comparisonPct > 0 ? "comparison comparison-up" : "comparison comparison-down"}>
            {data.comparisonPct === null ? "暂无对比" : `${data.comparisonPct > 0 ? "+" : ""}${data.comparisonPct}% ${data.comparisonLabel}`}
          </div>
          {data.current && date === today && !currentPaused && (
            <div className="current-usage">
              <span className="live-dot" />
              <div><span>正在使用</span><strong>{data.current.name}</strong></div>
              <b>{formatDuration(data.current.durationSeconds, true)}</b>
            </div>
          )}
        </div>
        <div className="category-overview">
          <div className="donut-wrap">
            <div className="donut" style={{ background: donut }}>
              <div><strong>{data.categories.length}</strong><span>个分类</span></div>
            </div>
          </div>
          <div className="category-summary-list">
            {data.categories.slice(0, 5).map((category) => (
              <div className="category-summary-row" key={category.id}>
                <span className="color-dot" style={{ background: category.color }} />
                <span>{category.name}</span>
                <strong>{formatDuration(category.durationSeconds, true)}</strong>
                <small>{Math.round((category.durationSeconds / Math.max(data.totalSeconds, 1)) * 100)}%</small>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="panel usage-panel">
        <div className="panel-heading">
          <div><p className="section-label">时间分布</p><h2>每小时使用情况</h2></div>
          <div className="chart-legend">
            {data.categories.slice(0, 4).map((category) => <span key={category.id}><i style={{ background: category.color }} />{category.name}</span>)}
          </div>
        </div>
        <div className="hour-chart" aria-label="24 小时使用时长柱状图">
          {data.hourly.map((bucket) => (
            <div className="hour-column" key={bucket.hour} title={`${String(bucket.hour).padStart(2, "0")}:00 · ${formatDuration(bucket.totalSeconds)}`}>
              <div className="hour-bar" style={{ height: `${Math.max(2, (bucket.totalSeconds / maxHour) * 100)}%` }}>
                {bucket.segments.map((segment) => (
                  <span key={segment.categoryId} style={{ height: `${(segment.seconds / Math.max(bucket.totalSeconds, 1)) * 100}%`, background: segment.color }} />
                ))}
              </div>
              <small>{bucket.hour % 3 === 0 ? String(bucket.hour).padStart(2, "0") : ""}</small>
            </div>
          ))}
        </div>
      </section>

      <section className="panel apps-panel">
        <div className="panel-heading"><div><p className="section-label">应用</p><h2>使用最多</h2></div><span className="count-label">{data.apps.length} 个应用</span></div>
        {data.apps.length === 0 ? (
          <div className="empty-state"><Clock3 size={22} /><strong>暂无使用记录</strong></div>
        ) : (
          <div className="apps-table">
            <div className="table-head"><span>应用</span><span>分类</span><span>占比</span><span>时长</span></div>
            {data.apps.slice(0, 8).map((app) => (
              <div className="app-row" key={app.id}>
                <div className="app-cell"><AppIcon name={app.name} iconDataUrl={app.iconDataUrl} color={app.categoryColor} /><strong>{app.name}</strong></div>
                <span className="category-pill"><i style={{ background: app.categoryColor }} />{app.categoryName}</span>
                <div className="usage-share"><span style={{ width: `${(app.durationSeconds / Math.max(data.totalSeconds, 1)) * 100}%`, background: app.categoryColor }} /></div>
                <b>{formatDuration(app.durationSeconds, true)}</b>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function PageLoading() {
  return <div className="page-loading"><span /><span /><span /></div>;
}
