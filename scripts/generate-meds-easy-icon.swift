#!/usr/bin/env swift

import Cocoa

// MARK: - Generate Meds Easy App Icon

let size = NSSize(width: 1024, height: 1024)

let image = NSImage(size: size, flipped: false) { rect in
    let context = NSGraphicsContext.current!.cgContext
    
    // Colors (Mint theme)
    let gradientStart = NSColor(red: 0x4E/255, green: 0xCD/255, blue: 0xC4/255, alpha: 1)
    let gradientMid = NSColor(red: 0x88/255, green: 0xD8/255, blue: 0xB0/255, alpha: 1)
    let gradientEnd = NSColor(red: 0xB8/255, green: 0xF0/255, blue: 0xC0/255, alpha: 1)
    
    // Draw gradient background
    let gradient = NSGradient(colors: [gradientStart, gradientMid, gradientEnd])!
    gradient.draw(in: rect, angle: -45)
    
    // Add subtle radial glow
    let glowGradient = NSGradient(colors: [
        NSColor.white.withAlphaComponent(0.25),
        NSColor.clear
    ])!
    glowGradient.draw(
        fromCenter: NSPoint(x: 0, y: rect.height),
        radius: 0,
        toCenter: NSPoint(x: 0, y: rect.height),
        radius: 700,
        options: []
    )
    
    // Save state and rotate for pill
    context.saveGState()
    context.translateBy(x: rect.width / 2, y: rect.height / 2)
    context.rotate(by: -20 * .pi / 180)
    
    // Draw pill shape (capsule)
    let pillWidth: CGFloat = 420
    let pillHeight: CGFloat = 200
    let pillRect = CGRect(x: -pillWidth/2, y: -pillHeight/2, width: pillWidth, height: pillHeight)
    
    // Pill shadow
    context.setShadow(offset: CGSize(width: 0, height: -15), blur: 30, color: NSColor.black.withAlphaComponent(0.15).cgColor)
    
    // Pill background
    let pillPath = NSBezierPath(roundedRect: pillRect, xRadius: pillHeight/2, yRadius: pillHeight/2)
    NSColor.white.withAlphaComponent(0.95).setFill()
    pillPath.fill()
    
    // Reset shadow
    context.setShadow(offset: .zero, blur: 0)
    
    // Right half tint
    context.saveGState()
    let clipPath = NSBezierPath(rect: CGRect(x: 0, y: -pillHeight/2, width: pillWidth/2, height: pillHeight))
    clipPath.addClip()
    gradientMid.withAlphaComponent(0.3).setFill()
    pillPath.fill()
    context.restoreGState()
    
    // Center divider line
    let lineRect = CGRect(x: -3, y: -90, width: 6, height: 180)
    gradientStart.withAlphaComponent(0.4).setFill()
    NSBezierPath(rect: lineRect).fill()
    
    context.restoreGState()
    
    // Draw checkmark
    let checkPath = NSBezierPath()
    let checkScale: CGFloat = 0.22
    let checkOffsetX: CGFloat = rect.width / 2
    let checkOffsetY: CGFloat = rect.height / 2 - 180
    
    // Checkmark path (scaled and positioned)
    checkPath.move(to: NSPoint(x: checkOffsetX - 120 * checkScale, y: checkOffsetY + 0 * checkScale))
    checkPath.line(to: NSPoint(x: checkOffsetX - 40 * checkScale, y: checkOffsetY - 80 * checkScale))
    checkPath.line(to: NSPoint(x: checkOffsetX + 120 * checkScale, y: checkOffsetY + 100 * checkScale))
    
    checkPath.lineWidth = 45
    checkPath.lineCapStyle = .round
    checkPath.lineJoinStyle = .round
    
    // Checkmark gradient stroke
    let checkGradient = NSGradient(colors: [gradientStart, gradientMid])!
    
    context.saveGState()
    checkPath.addClip()
    checkGradient.draw(in: NSRect(x: checkOffsetX - 150, y: checkOffsetY - 100, width: 300, height: 250), angle: -45)
    context.restoreGState()
    
    // Actually stroke the checkmark with gradient
    gradientStart.setStroke()
    checkPath.stroke()
    
    return true
}

// Save as PNG
guard let tiffData = image.tiffRepresentation,
      let bitmapRep = NSBitmapImageRep(data: tiffData),
      let pngData = bitmapRep.representation(using: .png, properties: [:]) else {
    print("Failed to create PNG data")
    exit(1)
}

let outputPath = FileManager.default.currentDirectoryPath + "/public/img/meds-easy/icon.png"
let outputURL = URL(fileURLWithPath: outputPath)

// Create directory if needed
try? FileManager.default.createDirectory(
    at: outputURL.deletingLastPathComponent(),
    withIntermediateDirectories: true
)

do {
    try pngData.write(to: outputURL)
    print("Icon saved to: \(outputPath)")
} catch {
    print("Failed to write: \(error)")
    exit(1)
}
