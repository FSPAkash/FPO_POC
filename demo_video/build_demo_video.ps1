param(
  [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

# Dash palette (matches frontend/src/index.css tokens)
#   bg-base   #f5fbf4   green-900 #1b5e20   green-600 #388e3c
#   green-500 #4caf50   green-300 #81c784   green-200 #a8dca8
#   green-100 #cbe6c8   green-50  #e6f4ea   gray-100  #e8ece8
#   gray-200  #d0d5d0   gray-500  #6b736b   gray-700  #2d332d   gray-800 #1a1f1a

function New-RgbColor([int]$r, [int]$g, [int]$b) {
  return $r + ($g * 256) + ($b * 65536)
}

function Set-SlideTiming($slide, [double]$seconds) {
  $transition = $slide.SlideShowTransition
  $transition.AdvanceOnClick = $false
  $transition.AdvanceOnTime = $true
  $transition.AdvanceTime = $seconds
  $transition.EntryEffect = 0          # ppEffectNone — no flash/fade
  $transition.Duration = 0
}

function Add-TextBox($slide, [double]$left, [double]$top, [double]$width, [double]$height, [string]$text, [int]$fontSize, [bool]$bold, [int]$color) {
  $shape = $slide.Shapes.AddTextbox(1, $left, $top, $width, $height)
  $shape.Line.Visible = 0
  $shape.Fill.Visible = 0
  $range = $shape.TextFrame.TextRange
  $range.Text = $text
  $range.Font.Name = "Segoe UI"
  $range.Font.Size = $fontSize
  $range.Font.Bold = [int]$bold
  $range.Font.Color.RGB = $color
  $shape.TextFrame.MarginLeft = 0
  $shape.TextFrame.MarginRight = 0
  $shape.TextFrame.MarginTop = 0
  $shape.TextFrame.MarginBottom = 0
  return $shape
}

function Add-BrandHeader($slide, [double]$slideWidth) {
  $topBar = $slide.Shapes.AddShape(1, 0, 0, $slideWidth, 44)
  $topBar.Fill.ForeColor.RGB = New-RgbColor 255 255 255
  $topBar.Line.Visible = 0

  $hairline = $slide.Shapes.AddShape(1, 0, 44, $slideWidth, 1)
  $hairline.Fill.ForeColor.RGB = New-RgbColor 232 236 232
  $hairline.Line.Visible = 0

  $brandDot = $slide.Shapes.AddShape(9, 28, 16, 12, 12)
  $brandDot.Fill.ForeColor.RGB = New-RgbColor 76 175 80
  $brandDot.Line.Visible = 0

  Add-TextBox $slide 48 14 220 18 "FPO Integrated OS" 11 $true (New-RgbColor 26 31 26) | Out-Null
  Add-TextBox $slide 168 16 240 16 "POWERED BY FINDABILITY SCIENCES" 8 $false (New-RgbColor 138 146 138) | Out-Null
}

function Add-TitleSlide($presentation, [int]$index, [hashtable]$scene, [double]$slideWidth, [double]$slideHeight) {
  $ppLayoutBlank = 12
  $slide = $presentation.Slides.Add($index, $ppLayoutBlank)

  # Pale green app background
  $bg = $slide.Shapes.AddShape(1, 0, 0, $slideWidth, $slideHeight)
  $bg.Fill.ForeColor.RGB = New-RgbColor 245 251 244
  $bg.Line.Visible = 0

  # Soft orbs (kept subtle, like login hero)
  foreach ($orb in @(
    @{ Left = -60; Top = -40; Size = 280; Color = (New-RgbColor 129 199 132); Transparency = 0.86 },
    @{ Left = 720; Top = 320; Size = 320; Color = (New-RgbColor 168 220 168); Transparency = 0.88 },
    @{ Left = 780; Top = 40;  Size = 140; Color = (New-RgbColor 230 244 234); Transparency = 0.55 }
  )) {
    $shape = $slide.Shapes.AddShape(9, $orb.Left, $orb.Top, $orb.Size, $orb.Size)
    $shape.Fill.ForeColor.RGB = $orb.Color
    $shape.Fill.Transparency = $orb.Transparency
    $shape.Line.Visible = 0
  }

  Add-BrandHeader $slide $slideWidth

  # Centered hero card (matches login card geometry)
  $cardLeft = 120
  $cardTop = 110
  $cardWidth = 720
  $cardHeight = 340
  $card = $slide.Shapes.AddShape(5, $cardLeft, $cardTop, $cardWidth, $cardHeight)
  $card.Fill.ForeColor.RGB = New-RgbColor 255 255 255
  $card.Line.ForeColor.RGB = New-RgbColor 224 235 224
  $card.Line.Weight = 1.25
  $card.Adjustments.Item(1) = 0.04

  # Eyebrow pill
  $pillWidth = 200
  $pillLeft = $cardLeft + 48
  $pill = $slide.Shapes.AddShape(5, $pillLeft, $cardTop + 44, $pillWidth, 26)
  $pill.Fill.ForeColor.RGB = New-RgbColor 230 244 234
  $pill.Line.ForeColor.RGB = New-RgbColor 168 220 168
  $pill.Line.Weight = 1
  $pill.Adjustments.Item(1) = 0.5

  $eyebrowDot = $slide.Shapes.AddShape(9, $pillLeft + 12, $cardTop + 53, 8, 8)
  $eyebrowDot.Fill.ForeColor.RGB = New-RgbColor 76 175 80
  $eyebrowDot.Line.Visible = 0

  $eyebrowTextHeight = 11
  $eyebrowTextTop = ($cardTop + 44) + ((26 - $eyebrowTextHeight) / 2)
  Add-TextBox $slide ($pillLeft + 26) $eyebrowTextTop ($pillWidth - 30) $eyebrowTextHeight $scene.Eyebrow.ToUpper() 9 $true (New-RgbColor 27 94 32) | Out-Null

  # Title + body
  Add-TextBox $slide ($cardLeft + 48) ($cardTop + 88)  ($cardWidth - 96) 110 $scene.Title 30 $true (New-RgbColor 26 31 26) | Out-Null
  Add-TextBox $slide ($cardLeft + 48) ($cardTop + 168) ($cardWidth - 96) 110 $scene.Body 15 $false (New-RgbColor 74 82 74) | Out-Null

  Set-SlideTiming $slide $scene.Duration
}

function Add-ImageSlide($presentation, [int]$index, [hashtable]$scene, [double]$slideWidth, [double]$slideHeight) {
  $ppLayoutBlank = 12
  $slide = $presentation.Slides.Add($index, $ppLayoutBlank)

  # Pale background so the framed screenshot reads on the dash bg
  $bg = $slide.Shapes.AddShape(1, 0, 0, $slideWidth, $slideHeight)
  $bg.Fill.ForeColor.RGB = New-RgbColor 245 251 244
  $bg.Line.Visible = 0

  # Caption strip (light, on top)
  $captionHeight = 96
  $captionTop = $slideHeight - $captionHeight
  $captionPanel = $slide.Shapes.AddShape(1, 0, $captionTop, $slideWidth, $captionHeight)
  $captionPanel.Fill.ForeColor.RGB = New-RgbColor 255 255 255
  $captionPanel.Line.Visible = 0

  $captionRule = $slide.Shapes.AddShape(1, 0, $captionTop, $slideWidth, 1)
  $captionRule.Fill.ForeColor.RGB = New-RgbColor 232 236 232
  $captionRule.Line.Visible = 0

  # Vertical green accent rail next to label
  $rail = $slide.Shapes.AddShape(1, 36, ($captionTop + 22), 3, 52)
  $rail.Fill.ForeColor.RGB = New-RgbColor 76 175 80
  $rail.Line.Visible = 0

  Add-TextBox $slide 50 ($captionTop + 20) 320 14 $scene.Label.ToUpper() 9 $true (New-RgbColor 27 94 32) | Out-Null
  Add-TextBox $slide 50 ($captionTop + 36) 580 26 $scene.Title 18 $true (New-RgbColor 26 31 26) | Out-Null
  Add-TextBox $slide 50 ($captionTop + 64) 880 28 $scene.Body 11 $false (New-RgbColor 74 82 74) | Out-Null

  # Compute screenshot frame in remaining vertical space, with margin
  $marginTop = 24
  $marginSide = 32
  $availTop = $marginTop
  $availBottom = $captionTop - 16
  $availHeight = $availBottom - $availTop
  $availWidth = $slideWidth - ($marginSide * 2)

  $image = [System.Drawing.Image]::FromFile($scene.Image)
  try {
    $imageAspect = [double]$image.Width / [double]$image.Height
  } finally {
    $image.Dispose()
  }
  $availAspect = $availWidth / $availHeight

  if ($imageAspect -ge $availAspect) {
    $picWidth = $availWidth
    $picHeight = $picWidth / $imageAspect
  } else {
    $picHeight = $availHeight
    $picWidth = $picHeight * $imageAspect
  }
  $picLeft = ($slideWidth - $picWidth) / 2
  $picTop = $availTop + (($availHeight - $picHeight) / 2)

  # Soft shadow card behind screenshot
  $shadow = $slide.Shapes.AddShape(5, ($picLeft + 4), ($picTop + 6), $picWidth, $picHeight)
  $shadow.Fill.ForeColor.RGB = New-RgbColor 224 235 224
  $shadow.Fill.Transparency = 0.55
  $shadow.Line.Visible = 0
  $shadow.Adjustments.Item(1) = 0.03

  # White frame
  $framePad = 6
  $frame = $slide.Shapes.AddShape(5, ($picLeft - $framePad), ($picTop - $framePad), ($picWidth + ($framePad * 2)), ($picHeight + ($framePad * 2)))
  $frame.Fill.ForeColor.RGB = New-RgbColor 255 255 255
  $frame.Line.ForeColor.RGB = New-RgbColor 224 235 224
  $frame.Line.Weight = 1
  $frame.Adjustments.Item(1) = 0.03

  $slide.Shapes.AddPicture($scene.Image, $false, $true, $picLeft, $picTop, $picWidth, $picHeight) | Out-Null

  Set-SlideTiming $slide $scene.Duration
}

$demoDir = Join-Path $RepoRoot "demo_video"
$screenshotsDir = Join-Path $demoDir "screenshots"
$pptPath = Join-Path $demoDir "FPO_Integrated_OS_Walkthrough.pptx"
$videoPath = Join-Path $demoDir "FPO_Integrated_OS_Walkthrough.mp4"

$scenes = @(
  @{
    Type = "title"
    Eyebrow = "FPO Integrated OS"
    Title = "Agent-led operating system for FPOs"
    Body = "A walkthrough of the unified platform for registry, fulfillment, market execution, communication, approvals, and carbon readiness."
    Duration = 4
  },
  @{
    Type = "image"
    Image = (Join-Path $screenshotsDir "00-login.png")
    Label = "Entry point"
    Title = "Five agents. One command center."
    Body = "The demo opens with a clear operating promise: specialist agents coordinate work while the FPO office steps in only where judgement is needed."
    Duration = 4
  },
  @{
    Type = "image"
    Image = (Join-Path $screenshotsDir "01-command.png")
    Label = "Command center"
    Title = "One operating surface for the autonomous state"
    Body = "Managers can see active queues, recent agent runs, work done automatically, and the exact items that still need people."
    Duration = 7
  },
  @{
    Type = "image"
    Image = (Join-Path $screenshotsDir "02-walkthrough.png")
    Label = "Flow walkthrough"
    Title = "Message-to-execution through specialist agents"
    Body = "Farmer intake routes the signal, fulfillment and crop-cycle agents act on it, and market or staff only enter when confidence or policy requires it."
    Duration = 6
  },
  @{
    Type = "image"
    Image = (Join-Path $screenshotsDir "03-registry.png")
    Label = "Farmer network"
    Title = "One source of truth for members, plots, and seasons"
    Body = "The registry keeps FPOs, farmers, geographies, communication profiles, and plot-season records connected in the same operating spine."
    Duration = 5
  },
  @{
    Type = "image"
    Image = (Join-Path $screenshotsDir "04-operations.png")
    Label = "Fulfillment"
    Title = "Input demand, procurement, stock, collections, settlements"
    Body = "Operations is where the system turns demand capture into procurement, inventory movement, produce intake, and downstream cash flow."
    Duration = 7
  },
  @{
    Type = "image"
    Image = (Join-Path $screenshotsDir "05-market.png")
    Label = "Market execution"
    Title = "Collections matched to buyer demand"
    Body = "The market layer surfaces the best current fit, converts it into sales orders, and keeps dispatch follow-through visible until money is collected."
    Duration = 6
  },
  @{
    Type = "image"
    Image = (Join-Path $screenshotsDir "06-whatsapp.png")
    Label = "Human handoff desk"
    Title = "Low-confidence work lands in one review queue"
    Body = "The handoff desk concentrates escalations, while the floating farmer phone shows the conversation thread that triggered the next action."
    Duration = 7
  },
  @{
    Type = "image"
    Image = (Join-Path $screenshotsDir "07-communication.png")
    Label = "Campaigns and outreach"
    Title = "Inbox, advisories, and broadcast in one place"
    Body = "The same platform handles inbound asks, outbound nudges, and campaign communication without moving teams into separate tools."
    Duration = 5
  },
  @{
    Type = "image"
    Image = (Join-Path $screenshotsDir "08-governance.png")
    Label = "Approvals and audit"
    Title = "Governed autonomy keeps the operating model safe"
    Body = "Thresholds route purchase requests and other sensitive actions into a single approval desk, with a clear audit trail behind every agent and human decision."
    Duration = 6
  },
  @{
    Type = "image"
    Image = (Join-Path $screenshotsDir "09-carbon.png")
    Label = "Carbon readiness"
    Title = "The same data spine extends into climate workflows"
    Body = "Registry, plot, and practice data make it possible to layer carbon readiness on top of the core operating system over time."
    Duration = 4
  },
  @{
    Type = "title"
    Eyebrow = "Closing note"
    Title = "Autonomous by default. Human only by exception."
    Body = "One operating system instead of many disconnected workflows."
    Duration = 4
  }
)

foreach ($scene in $scenes) {
  if ($scene.Type -eq "image" -and -not (Test-Path $scene.Image)) {
    throw "Missing screenshot: $($scene.Image)"
  }
}

if (Test-Path $pptPath) {
  Remove-Item $pptPath -Force
}

if (Test-Path $videoPath) {
  Remove-Item $videoPath -Force
}

$ppSaveAsOpenXMLPresentation = 24
$slideWidth = 960
$slideHeight = 540

$powerPoint = $null
$presentation = $null

try {
  $powerPoint = New-Object -ComObject PowerPoint.Application
  $powerPoint.Visible = 1
  $presentation = $powerPoint.Presentations.Add()
  $presentation.PageSetup.SlideWidth = $slideWidth
  $presentation.PageSetup.SlideHeight = $slideHeight

  for ($i = 0; $i -lt $scenes.Count; $i += 1) {
    $scene = $scenes[$i]
    $index = $i + 1
    if ($scene.Type -eq "title") {
      Add-TitleSlide $presentation $index $scene $slideWidth $slideHeight
    } else {
      Add-ImageSlide $presentation $index $scene $slideWidth $slideHeight
    }
  }

  $presentation.SaveAs($pptPath, $ppSaveAsOpenXMLPresentation)
  $presentation.CreateVideo($videoPath, $true, 5, 720, 12, 85)

  $deadline = (Get-Date).AddMinutes(15)
  while ((Get-Date) -lt $deadline) {
    $status = [int]$presentation.CreateVideoStatus
    if ($status -eq 3) {
      break
    }
    if ($status -eq 4) {
      throw "PowerPoint video export failed."
    }
    Start-Sleep -Seconds 3
  }

  if (-not (Test-Path $videoPath)) {
    throw "Video export did not produce an MP4 file."
  }

  Get-Item $pptPath, $videoPath | Select-Object Name, Length, LastWriteTime
}
finally {
  if ($presentation) {
    $presentation.Close()
  }
  if ($powerPoint) {
    $powerPoint.Quit()
  }
  [System.GC]::Collect()
  [System.GC]::WaitForPendingFinalizers()
}
