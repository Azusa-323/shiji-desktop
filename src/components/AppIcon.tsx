import { initials } from "../utils";

interface AppIconProps {
  name: string;
  iconDataUrl?: string;
  color?: string;
  size?: "small" | "medium";
}

export function AppIcon({ name, iconDataUrl, color = "#64726d", size = "medium" }: AppIconProps) {
  if (iconDataUrl) {
    return <img className={`app-icon app-icon-${size}`} src={iconDataUrl} alt="" />;
  }
  return (
    <span className={`app-icon app-icon-fallback app-icon-${size}`} style={{ "--app-color": color } as React.CSSProperties}>
      {initials(name)}
    </span>
  );
}
