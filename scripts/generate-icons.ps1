$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$buildDir = Join-Path $root "build"
$sourceIcon = Join-Path $root "docs\assets\bridgedesk-logo-light.png"
[System.IO.Directory]::CreateDirectory($buildDir) | Out-Null

function New-ResizedPng {
  param(
    [System.Drawing.Image] $Source,
    [int] $Size,
    [string] $Path
  )

  $bitmap = [System.Drawing.Bitmap]::new($Size, $Size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $graphics.Clear([System.Drawing.Color]::Transparent)
  $target = [System.Drawing.Rectangle]::new(0, 0, $Size, $Size)
  $graphics.DrawImage($Source, $target)

  $bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)

  $graphics.Dispose()
  $bitmap.Dispose()
}

function Write-Ico {
  param(
    [array] $Images,
    [string] $Path
  )

  $stream = [System.IO.File]::Create($Path)
  $writer = [System.IO.BinaryWriter]::new($stream)

  try {
    $writer.Write([UInt16]0)
    $writer.Write([UInt16]1)
    $writer.Write([UInt16]$Images.Count)

    $offset = 6 + (16 * $Images.Count)
    $entries = @()
    foreach ($image in $Images) {
      $bytes = [System.IO.File]::ReadAllBytes($image.Path)
      $entries += [PSCustomObject]@{
        Size = [int]$image.Size
        Bytes = $bytes
        Offset = $offset
      }
      $offset += $bytes.Length
    }

    foreach ($entry in $entries) {
      $sizeByte = if ($entry.Size -eq 256) { 0 } else { $entry.Size }
      $writer.Write([byte]$sizeByte)
      $writer.Write([byte]$sizeByte)
      $writer.Write([byte]0)
      $writer.Write([byte]0)
      $writer.Write([UInt16]1)
      $writer.Write([UInt16]32)
      $writer.Write([UInt32]$entry.Bytes.Length)
      $writer.Write([UInt32]$entry.Offset)
    }

    foreach ($entry in $entries) {
      $writer.Write([byte[]]$entry.Bytes)
    }
  } finally {
    $writer.Dispose()
    $stream.Dispose()
  }
}

$sizes = @(16, 24, 32, 48, 64, 128, 256)
$images = @()
$source = [System.Drawing.Image]::FromFile($sourceIcon)
foreach ($size in $sizes) {
  $path = Join-Path $buildDir "icon-$size.png"
  New-ResizedPng -Source $source -Size $size -Path $path
  $images += [PSCustomObject]@{ Size = $size; Path = $path }
}
$source.Dispose()

Copy-Item -LiteralPath (Join-Path $buildDir "icon-256.png") -Destination (Join-Path $buildDir "icon.png") -Force
Copy-Item -LiteralPath (Join-Path $buildDir "icon-32.png") -Destination (Join-Path $buildDir "tray-icon.png") -Force
Write-Ico -Images $images -Path (Join-Path $buildDir "icon.ico")
