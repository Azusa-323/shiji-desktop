import { useEffect, useMemo, useState } from "react";
import { Check, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { AppIcon } from "../components/AppIcon";
import { api } from "../timewise";
import type { AppUsage, Category, CategoryInput } from "../types";

const colorOptions = ["#28785d", "#3d6dcc", "#e05b47", "#e2a526", "#9b62ad", "#1e8a9a", "#64726d", "#b7586c"];

interface CategoriesPageProps {
  onNotice: (message: string) => void;
  refreshKey: number;
}

export function CategoriesPage({ onNotice, refreshKey }: CategoriesPageProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [apps, setApps] = useState<AppUsage[]>([]);
  const [selectedApps, setSelectedApps] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [editor, setEditor] = useState<CategoryInput | null>(null);

  async function load() {
    const [nextCategories, nextApps] = await Promise.all([api.getCategories(), api.getApps()]);
    setCategories(nextCategories);
    setApps(nextApps);
  }

  useEffect(() => { void load(); }, [refreshKey]);

  const filteredApps = useMemo(
    () => apps.filter((app) => app.name.toLowerCase().includes(query.trim().toLowerCase())),
    [apps, query],
  );

  async function saveCategory() {
    if (!editor?.name.trim()) return;
    const next = await api.saveCategory({ ...editor, name: editor.name.trim() });
    setCategories(next);
    setEditor(null);
    onNotice(editor.id ? "分类已更新" : "分类已创建");
  }

  async function removeCategory(category: Category) {
    if (!confirm(`删除“${category.name}”？其中的应用将转入“未分类”。`)) return;
    setCategories(await api.deleteCategory(category.id));
    await load();
    onNotice("分类已删除");
  }

  async function assign(categoryId: string) {
    if (selectedApps.length === 0) return;
    await api.assignCategory(selectedApps, categoryId);
    setSelectedApps([]);
    await load();
    onNotice("应用分类已更新");
  }

  return (
    <div className="page categories-page">
      <header className="page-header">
        <div><p className="eyebrow">整理</p><h1>分类与应用</h1></div>
        <button className="primary-button" onClick={() => setEditor({ name: "", color: colorOptions[0] })}><Plus size={18} />新建分类</button>
      </header>

      <section className="category-strip" aria-label="分类列表">
        {categories.map((category) => {
          const count = apps.filter((app) => app.categoryId === category.id).length;
          return (
            <div className="category-tile" key={category.id}>
              <span className="category-swatch" style={{ background: category.color }} />
              <div><strong>{category.name}</strong><span>{count} 个应用</span></div>
              {!category.isSystem && (
                <div className="tile-actions">
                  <button className="icon-button icon-button-small" onClick={() => setEditor({ id: category.id, name: category.name, color: category.color })} title="编辑分类" aria-label={`编辑${category.name}`}><Pencil size={15} /></button>
                  <button className="icon-button icon-button-small danger-icon" onClick={() => void removeCategory(category)} title="删除分类" aria-label={`删除${category.name}`}><Trash2 size={15} /></button>
                </div>
              )}
            </div>
          );
        })}
      </section>

      <section className="panel app-manager">
        <div className="manager-toolbar">
          <div><p className="section-label">已发现应用</p><h2>应用分类</h2></div>
          <label className="search-field"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索应用" aria-label="搜索应用" /></label>
        </div>
        {selectedApps.length > 0 && (
          <div className="bulk-toolbar">
            <strong>已选 {selectedApps.length} 项</strong>
            <span>移动到</span>
            <select defaultValue="" onChange={(event) => event.target.value && void assign(event.target.value)} aria-label="移动到分类">
              <option value="" disabled>选择分类</option>
              {categories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}
            </select>
            <button className="icon-button icon-button-small" onClick={() => setSelectedApps([])} title="取消选择" aria-label="取消选择"><X size={16} /></button>
          </div>
        )}
        <div className="manager-list">
          <div className="manager-head"><span /><span>应用</span><span>可执行文件</span><span>分类</span></div>
          {filteredApps.map((app) => {
            const selected = selectedApps.includes(app.id);
            return (
              <div className={selected ? "manager-row selected" : "manager-row"} key={app.id}>
                <button className={selected ? "selection-box checked" : "selection-box"} onClick={() => setSelectedApps((current) => selected ? current.filter((id) => id !== app.id) : [...current, app.id])} aria-label={`${selected ? "取消选择" : "选择"}${app.name}`}>{selected && <Check size={14} />}</button>
                <div className="app-cell"><AppIcon name={app.name} iconDataUrl={app.iconDataUrl} color={app.categoryColor} /><strong>{app.name}</strong></div>
                <span className="executable-name">{app.executable || app.stableKey.split(/[\\/]/).at(-1)}</span>
                <select value={app.categoryId} onChange={(event) => void api.assignCategory([app.id], event.target.value).then(load)} aria-label={`${app.name}的分类`}>
                  {categories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}
                </select>
              </div>
            );
          })}
        </div>
      </section>

      {editor && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="category-editor-title">
          <section className="dialog-panel category-editor">
            <div className="dialog-heading"><h2 id="category-editor-title">{editor.id ? "编辑分类" : "新建分类"}</h2><button className="icon-button" onClick={() => setEditor(null)} title="关闭" aria-label="关闭"><X size={19} /></button></div>
            <label className="field-label">名称<input autoFocus value={editor.name} maxLength={20} onChange={(event) => setEditor({ ...editor, name: event.target.value })} placeholder="分类名称" /></label>
            <fieldset className="color-field"><legend>颜色</legend><div>{colorOptions.map((color) => <button key={color} className={editor.color === color ? "color-choice selected" : "color-choice"} style={{ background: color }} onClick={() => setEditor({ ...editor, color })} aria-label={`选择颜色 ${color}`}>{editor.color === color && <Check size={17} />}</button>)}</div></fieldset>
            <div className="dialog-actions"><button className="secondary-button" onClick={() => setEditor(null)}>取消</button><button className="primary-button" disabled={!editor.name.trim()} onClick={() => void saveCategory()}>保存</button></div>
          </section>
        </div>
      )}
    </div>
  );
}
