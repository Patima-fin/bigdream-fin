# =====================================================================
# BIGDREAM - prepare logo assets from the source artwork
# =====================================================================
# Reads the first .png inside  logo\   (the wide master artwork) and writes:
#   bigdream_logo.png  - whitespace trimmed + white made transparent
#                        (used by splash / sidebar / login / print header)
#   bigdream_mark.png  - the green symbol only, square canvas
#                        (used by favicon + collapsed sidebar)
#
# Run:  powershell -File tools\logo-prep.ps1           (analyse only)
#       powershell -File tools\logo-prep.ps1 -Build    (write the files)
#
# NOTE: keep this file ASCII-only. Windows PowerShell 5.1 reads .ps1 as ANSI
#       unless the file has a BOM, so Thai literals here would be mangled.
# =====================================================================
param([switch]$Build)

Add-Type -AssemblyName System.Drawing
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$srcFile = Get-ChildItem -LiteralPath (Join-Path $root 'logo') -Filter *.png | Select-Object -First 1
if (-not $srcFile) { throw "No .png found in $root\logo" }
$src = $srcFile.FullName
Write-Output ("source      : logo\{0}" -f $srcFile.Name)

$bmp = [System.Drawing.Bitmap]::FromFile($src)
$w = $bmp.Width; $h = $bmp.Height
$rect = New-Object System.Drawing.Rectangle 0, 0, $w, $h
$data = $bmp.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadOnly, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$stride = $data.Stride
$bytes = New-Object byte[] ($stride * $h)
[System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $bytes, 0, $bytes.Length)
$bmp.UnlockBits($data)
$bmp.Dispose()

# ---- scan for bounding boxes -----------------------------------------
$aZero = 0; $aFull = 0; $aMid = 0
$minX = $w; $minY = $h; $maxX = -1; $maxY = -1      # all visible content
$gMinX = $w; $gMinY = $h; $gMaxX = -1; $gMaxY = -1  # lime-green symbol only
for ($y = 0; $y -lt $h; $y++) {
  $row = $y * $stride
  for ($x = 0; $x -lt $w; $x++) {
    $i = $row + $x*4
    $b = $bytes[$i]; $g = $bytes[$i+1]; $r = $bytes[$i+2]; $a = $bytes[$i+3]
    if ($a -eq 0) { $aZero++ } elseif ($a -eq 255) { $aFull++ } else { $aMid++ }
    if ($a -gt 16 -and -not ($r -gt 246 -and $g -gt 246 -and $b -gt 246)) {
      if ($x -lt $minX) { $minX = $x }
      if ($x -gt $maxX) { $maxX = $x }
      if ($y -lt $minY) { $minY = $y }
      if ($y -gt $maxY) { $maxY = $y }
      if ($g -gt 150 -and ($g - $b) -gt 50 -and $r -gt 120) {
        if ($x -lt $gMinX) { $gMinX = $x }
        if ($x -gt $gMaxX) { $gMaxX = $x }
        if ($y -lt $gMinY) { $gMinY = $y }
        if ($y -gt $gMaxY) { $gMaxY = $y }
      }
    }
  }
}

$cw = $maxX - $minX + 1; $ch = $maxY - $minY + 1
$mw = $gMaxX - $gMinX + 1; $mh = $gMaxY - $gMinY + 1
Write-Output ("size        : {0}x{1}" -f $w, $h)
Write-Output ("alpha       : transparent={0}  opaque={1}  partial={2}" -f $aZero, $aFull, $aMid)
Write-Output ("content bbox: x {0}..{1}  y {2}..{3}  => {4}x{5}" -f $minX, $maxX, $minY, $maxY, $cw, $ch)
Write-Output ("mark bbox   : x {0}..{1}  y {2}..{3}  => {4}x{5}" -f $gMinX, $gMaxX, $gMinY, $gMaxY, $mw, $mh)
if (-not $Build) { Write-Output ''; Write-Output 'analyse only - pass -Build to write the files'; return }

# ---- helper: crop a region, centre it on a canvas, whiten -> alpha ----
function New-Cropped {
  param([int]$X, [int]$Y, [int]$W, [int]$H, [int]$OutW, [int]$OutH)
  $out = New-Object System.Drawing.Bitmap $OutW, $OutH, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $orect = New-Object System.Drawing.Rectangle 0, 0, $OutW, $OutH
  $odata = $out.LockBits($orect, [System.Drawing.Imaging.ImageLockMode]::WriteOnly, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $ostride = $odata.Stride
  $obytes = New-Object byte[] ($ostride * $OutH)
  $offX = [int](($OutW - $W) / 2)
  $offY = [int](($OutH - $H) / 2)
  for ($yy = 0; $yy -lt $H; $yy++) {
    $srow = ($Y + $yy) * $stride
    $drow = ($yy + $offY) * $ostride
    for ($xx = 0; $xx -lt $W; $xx++) {
      $si = $srow + ($X + $xx)*4
      $di = $drow + ($xx + $offX)*4
      $b = $bytes[$si]; $g = $bytes[$si+1]; $r = $bytes[$si+2]; $a = $bytes[$si+3]
      # solid white -> fully transparent; near-white (antialiased edges) -> partial
      if ($a -gt 0) {
        $mn = [Math]::Min($r, [Math]::Min($g, $b))
        if ($mn -ge 250) { $a = 0 }
        elseif ($mn -gt 225) { $a = [byte]([Math]::Round($a * (250 - $mn) / 25.0)) }
      }
      $obytes[$di]   = $b
      $obytes[$di+1] = $g
      $obytes[$di+2] = $r
      $obytes[$di+3] = $a
    }
  }
  [System.Runtime.InteropServices.Marshal]::Copy($obytes, 0, $odata.Scan0, $obytes.Length)
  $out.UnlockBits($odata)
  return $out
}

function Save-Resized {
  param([System.Drawing.Bitmap]$Bmp, [int]$MaxW, [int]$MaxH, [string]$Path)
  $scale = [Math]::Min($MaxW / $Bmp.Width, $MaxH / $Bmp.Height)
  if ($scale -gt 1) { $scale = 1 }
  $nw = [int][Math]::Round($Bmp.Width * $scale)
  $nh = [int][Math]::Round($Bmp.Height * $scale)
  $dst = New-Object System.Drawing.Bitmap $nw, $nh, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $gfx = [System.Drawing.Graphics]::FromImage($dst)
  $gfx.InterpolationMode    = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $gfx.PixelOffsetMode      = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $gfx.SmoothingMode        = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $gfx.CompositingQuality   = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $gfx.Clear([System.Drawing.Color]::Transparent)
  $gfx.DrawImage($Bmp, (New-Object System.Drawing.Rectangle 0, 0, $nw, $nh))
  $gfx.Dispose()
  $dst.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
  Write-Output ("wrote {0}  ({1}x{2})" -f (Split-Path -Leaf $Path), $nw, $nh)
  $dst.Dispose()
}

# 1) full lockup - trimmed, 2% breathing room
$pad = [int]($cw * 0.02)
$full = New-Cropped -X $minX -Y $minY -W $cw -H $ch -OutW ($cw + $pad*2) -OutH ($ch + $pad*2)
Save-Resized -Bmp $full -MaxW 1200 -MaxH 400 -Path (Join-Path $root 'bigdream_logo.png')
$full.Dispose()

# 2) symbol only - square, 12% breathing room
$side = [int]([Math]::Max($mw, $mh) * 1.12)
$mark = New-Cropped -X $gMinX -Y $gMinY -W $mw -H $mh -OutW $side -OutH $side
Save-Resized -Bmp $mark -MaxW 512 -MaxH 512 -Path (Join-Path $root 'bigdream_mark.png')
$mark.Dispose()
