import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { AppIcon } from "../components/AppIcon";
import { api } from "../timewise";
import type { HistoryData, Period } from "../types";
import { formatDuration, localDateString, rangeLabel, shiftDate } from "../utils";

export function HistoryPage({ refreshKey }: { refreshKey: number }) {
  const [period, setPeriod] = useState<Period>("week");
  const [anchor, setAnchor] = useState(localDateString());
  const [data, setData] = useState<HistoryData | null>(null);

  useEffect(() => {
    setData(null);
    api.getHistory(period, anchor).then(setData);
  }, [period, anchor, refreshKey]);

  const step = period === "week" ? 7 : 30;
  const maxDay = Math.max(...(data?.daily.map((day) => day.totalSeconds) ?? [1]), 1);

  return (
    <div className="page history-page">
      <header className="page-header">
        <div><p className="eyebrow">趋势</p><h1>历史记录</h1></div>
        <div className="segmented-control" aria-label="历史范围">
          <button className={period === "week" ? "active" : ""} onClick={() => setPeriod("week")}>周</button>
          <button className={period === "month" ? "active" : ""} onClick={() => setPeriod("month")}>月</button>
        </div>
      </header>
      <div className="range-toolbar">
        <button className="icon-button" onClick={() => setAnchor(shiftDate(anchor, -step))} title="上一段" aria-label="上一段"><ChevronLeft size={19} /></button>
        <strong>{data ? rangeLabel(data.startDate, data.endDate) : "加载中"}</strong>
        <button className="icon-button" disabled={anchor >= localDateString()} onClick={() => setAnchor(shiftDate(anchor, step))} title="下一段" aria-label="下一段"><ChevronRight size={19} /></button>
        {anchor !== localDateString() && <button className="text-button" onClick={() => setAnchor(localDateString())}>回到本{period === "week" ? "周" : "月"}</button>}
      </div>

      {!data ? <div className="page-loading"><span /><span /><span /></div> : (
        <>
          <section className="history-metrics">
            <div><span>总时长</span><strong>{formatDuration(data.totalSeconds)}</strong></div>
            <div><span>日均</span><strong>{formatDuration(data.dailyAverageSeconds)}</strong></div>
            <div><span>较上一{period === "week" ? "周" : "月"}</span><strong className={data.comparisonPct && data.comparisonPct > 0 ? "metric-up" : "metric-down"}>{data.comparisonPct === null ? "--" : `${data.comparisonPct > 0 ? "+" : ""}${data.comparisonPct}%`}</strong></div>
          </section>

          <section className="panel trend-panel">
            <div className="panel-heading"><div><p className="section-label">每日时长</p><h2>{period === "week" ? "本周" : "本月"}分布</h2></div></div>
            <div className={period === "week" ? "trend-chart" : "trend-chart trend-chart-month"}>
              {data.daily.map((day, index) => (
                <div className="trend-column" key={day.date} title={`${day.date} · ${formatDuration(day.totalSeconds)}`}>
                  <div className="trend-bar" style={{ height: `${Math.max(3, (day.totalSeconds / maxDay) * 100)}%` }}>
                    {day.segments.map((segment) => <span key={segment.categoryId} style={{ height: `${(segment.seconds / Math.max(day.totalSeconds, 1)) * 100}%`, background: segment.color }} />)}
                  </div>
                  <small>{period === "week" || index % 5 === 0 ? day.label : ""}</small>
                </div>
              ))}
            </div>
          </section>

          <div className="history-detail-grid">
            <section className="panel category-detail-panel">
              <div className="panel-heading"><div><p className="section-label">分类占比</p><h2>时间去向</h2></div></div>
              <div className="category-detail-list">
                {data.categories.map((category) => (
                  <div key={category.id}>
                    <span className="color-dot" style={{ background: category.color }} /><strong>{category.name}</strong>
                    <div className="usage-share"><span style={{ width: `${(category.durationSeconds / Math.max(data.totalSeconds, 1)) * 100}%`, background: category.color }} /></div>
                    <b>{formatDuration(category.durationSeconds, true)}</b>
                  </div>
                ))}
              </div>
            </section>
            <section className="panel compact-apps-panel">
              <div className="panel-heading"><div><p className="section-label">应用排行</p><h2>使用最多</h2></div></div>
              {data.apps.slice(0, 5).map((app, index) => (
                <div className="compact-app-row" key={app.id}><span>{index + 1}</span><AppIcon name={app.name} iconDataUrl={app.iconDataUrl} color={app.categoryColor} size="small" /><strong>{app.name}</strong><b>{formatDuration(app.durationSeconds, true)}</b></div>
              ))}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
