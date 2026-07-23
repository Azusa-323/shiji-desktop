$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$output = Join-Path (Split-Path -Parent $PSScriptRoot) 'build'
[System.IO.Directory]::CreateDirectory($output) | Out-Null
$sizes = @(16, 24, 32, 48, 64, 128, 256, 512)

foreach ($size in $sizes) {
  $bitmap = [System.Drawing.Bitmap]::new($size, $size)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  $graphics.Clear([System.Drawing.Color]::Transparent)

  $inset = [Math]::Max(1, [Math]::Round($size * 0.035))
  $diameter = [Math]::Round($size * 0.25)
  $bounds = [System.Drawing.RectangleF]::new($inset, $inset, $size - 2 * $inset, $size - 2 * $inset)
  $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $path.AddArc($bounds.Left, $bounds.Top, $diameter, $diameter, 180, 90)
  $path.AddArc($bounds.Right - $diameter, $bounds.Top, $diameter, $diameter, 270, 90)
  $path.AddArc($bounds.Right - $diameter, $bounds.Bottom - $diameter, $diameter, $diameter, 0, 90)
  $path.AddArc($bounds.Left, $bounds.Bottom - $diameter, $diameter, $diameter, 90, 90)
  $path.CloseFigure()

  $background = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#DBED72'))
  $graphics.FillPath($background, $path)

  $fontSize = [Math]::Max(8, $size * 0.48)
  $font = [System.Drawing.Font]::new('Microsoft YaHei UI', $fontSize, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $foreground = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#18201C'))
  $format = [System.Drawing.StringFormat]::new()
  $format.Alignment = [System.Drawing.StringAlignment]::Center
  $format.LineAlignment = [System.Drawing.StringAlignment]::Center
  $textBounds = [System.Drawing.RectangleF]::new(0, -$size * 0.025, $size, $size)
  $graphics.DrawString([string][char]0x65F6, $font, $foreground, $textBounds, $format)

  $bitmap.Save((Join-Path $output "icon-$size.png"), [System.Drawing.Imaging.ImageFormat]::Png)
  if ($size -eq 512) {
    $bitmap.Save((Join-Path $output 'icon.png'), [System.Drawing.Imaging.ImageFormat]::Png)
  }

  $format.Dispose()
  $foreground.Dispose()
  $font.Dispose()
  $background.Dispose()
  $path.Dispose()
  $graphics.Dispose()
  $bitmap.Dispose()
}
