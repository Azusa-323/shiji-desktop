# 时迹

时迹是一款本地优先的桌面应用，用于记录前台应用的有效使用时长。数据保存在本机 SQLite 数据库中，不采集窗口标题、键盘内容、文件内容或屏幕画面。

## 已实现

- 前台应用识别和 10 秒纠错心跳
- 空闲、锁屏、休眠、暂停和异常长间隔排除
- 跨小时、跨零点会话切分
- 今日概览、分类汇总、24 小时分布和应用排行
- 周/月历史趋势
- 分类管理和批量分配
- 托盘常驻、开机启动和暂停统计
- CSV 导出、按日/全部清除、本地数据库
- 浅色、深色和跟随系统主题

## 运行

环境要求：Node.js 22 或更高版本。

```powershell
npm install
npm run build
npm start
```

开发模式：

```powershell
npm run dev
```

生成 Windows 便携包：

```powershell
npm run package:win
```

输出文件位于 `release/Shiji-0.1.0-Portable.exe`。

## 数据位置

数据库存放在 Electron 的标准用户数据目录，可在“设置 > 数据”中打开。原始会话、每日聚合和小时聚合均由事务写入；应用分类按当前分类动态汇总历史数据。

## 验证

```powershell
npm run check
npm test
npm run build
```

当前已在 Windows 环境完成采集和运行验证。macOS 代码使用同一套 `active-win` 与 `powerMonitor` 平台接口，但发布前仍需在 macOS 13+ 真机验证登录启动、休眠和签名公证流程。
