import { Database, EyeOff, Keyboard, MonitorUp } from "lucide-react";

interface OnboardingProps {
  onComplete: () => Promise<void>;
}

export function Onboarding({ onComplete }: OnboardingProps) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
      <section className="onboarding-panel">
        <div className="brand-mark brand-mark-large" aria-hidden="true">
          时
        </div>
        <p className="eyebrow">首次启动</p>
        <h1 id="onboarding-title">欢迎使用时迹</h1>
        <p className="onboarding-lead">你的使用记录只保存在这台电脑上。</p>
        <div className="privacy-grid">
          <div className="privacy-item">
            <MonitorUp size={20} />
            <div><strong>仅识别前台应用</strong><span>记录应用名称和有效使用时长</span></div>
          </div>
          <div className="privacy-item">
            <Database size={20} />
            <div><strong>本地存储</strong><span>数据不会上传到云端</span></div>
          </div>
          <div className="privacy-item">
            <EyeOff size={20} />
            <div><strong>不截取屏幕</strong><span>不读取窗口标题或文件内容</span></div>
          </div>
          <div className="privacy-item">
            <Keyboard size={20} />
            <div><strong>不记录输入</strong><span>不采集按键和鼠标内容</span></div>
          </div>
        </div>
        <button className="primary-button onboarding-action" onClick={() => void onComplete()}>
          同意并开始统计
        </button>
      </section>
    </div>
  );
}
