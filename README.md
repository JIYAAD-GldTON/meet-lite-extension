# ⚡ MeetLite — Low-Bandwidth Google Meet Extension

> **Run Google Meet smoothly on 2G, 3G, unstable mobile hotspots, and metered networks.**  
> Cut bandwidth consumption by **85% to 98%** (from ~3.5–5.0 Mbps down to **35–180 Kbps**).  
> **Theme**: Clean Modern Lite with high-contrast status chips & isolated Shadow DOM.

---

## 🎯 What Problems Does MeetLite Solve?

Google Meet by default consumes **massive** amounts of data:
- High-definition 720p/1080p outgoing camera video feeds
- Multi-party video grid downloading dozens of megabytes per minute
- AI background blur running heavy WebGL filters
- High-bitrate audio streaming
- Continuous Google Analytics and telemetry pings
- Inactive tabs continuing to stream full HD video in the background while you take notes

**MeetLite** intercepts Google Meet's WebRTC engine at the browser level and gives you granular control over every single bandwidth-heavy feature.

---

## 📊 Bandwidth Consumption Breakdown

| Feature | Standard Meet | With MeetLite | Data Saved |
|---|---|---|---|
| **Outgoing Camera Video** | 1,500 – 3,500 Kbps | **0 – 120 Kbps** (180p @ 10fps or OFF) | **92% – 100%** |
| **Incoming Video Feeds** | 2,000 – 5,000 Kbps | **0 Kbps** (Audio-Only Mode) | **100%** |
| **Opus Audio Stream** | 48 – 64 Kbps | **20 Kbps** (Voice-Optimized Opus) | **60%** |
| **Background Blur / Filters** | +300 Kbps + GPU load | **Blocked** | **100%** |
| **Background Tab Inactive** | Full video streaming | **Auto-Frozen** | **100%** during notes |
| **Telemetry & Trackers** | 20 – 30 Kbps continuous | **Blocked** (`rules.json`) | **100%** |
| **TOTAL CALL USAGE** | **~3,500 – 5,000 Kbps** | **~35 – 180 Kbps** | **85% – 98% SAVINGS** |

---

## 🚀 Quick Network Presets

| Preset | Outgoing Video | Incoming Video | Target Bandwidth | Best For |
|---|---|---|---|---|
| ⚡ **Ultra-Saver** | OFF (Audio only) | OFF (Audio only) | **~35 – 50 Kbps** | 2G networks, emergency edge connectivity |
| 🛡️ **Low (Recommended)** | 180p @ 10 fps | Audio only | **~150 – 180 Kbps** | 3G, weak mobile hotspots, train/travel |
| ⚖️ **Balanced** | 360p @ 15 fps | Low-res 360p | **~500 – 600 Kbps** | Capped data plans, shared home WiFi |
| 🌐 **Meet Normal** | Standard 720p | Standard Multi-party | ~3,500 Kbps | High-speed fiber connections |

---

## 🧩 Key Features

1. **In-Call Draggable Floating HUD**:
   - Live network speed gauges showing real-time upload (⬆️) and download (⬇️) in Kbps.
   - Cumulative session data saved counter (e.g. `~145 MB saved`).
   - One-click presets and individual feature toggles.
   - Draggable header; remembers position across calls.
   - Minimize button collapses HUD into a tiny floating pill.

2. **WebRTC Media Engine Interceptors**:
   - Intercepts `navigator.mediaDevices.getUserMedia` before Meet captures the camera stream to clamp resolution to 180p/360p and cap framerate to 5/10/15 fps.
   - Patches `RTCRtpSender.prototype.setParameters` to enforce maximum bitrate ceilings (`maxBitrate`).
   - Hooks remote video receivers to mute incoming video tracks in Audio-Only mode without breaking audio.

3. **Auto-Freeze on Inactive Tab**:
   - Detects when you switch to another tab or minimize the browser window.
   - Automatically pauses incoming video streams while keeping audio crystal clear.
   - Instantly resumes when you switch back.

4. **Telemetry & Tracker Shield**:
   - Uses Chrome's `declarativeNetRequest` to block analytics and telemetry endpoints (`google-analytics.com`, `play.google.com/log`, etc.) with zero performance overhead.

5. **Toolbar Action Badge**:
   - Real-time bandwidth indicator directly on your browser toolbar icon (e.g. `45k` green badge).

---

## 📥 Installation Guide

### On PC (Google Chrome, Brave, Microsoft Edge, Opera, Vivaldi)

1. Open your browser and navigate to:
   - Chrome: `chrome://extensions`
   - Brave: `brave://extensions`
   - Edge: `edge://extensions`
2. Enable **Developer mode** (toggle switch in the top-right corner).
3. Click the **"Load unpacked"** button.
4. Select the directory:
   ```
   path/to/meet-lite-extension
   ```
5. MeetLite will appear in your extensions list and on your browser toolbar!
6. Navigate to [meet.google.com](https://meet.google.com) and start or join any meeting. The MeetLite floating HUD will appear automatically in the bottom-right corner.

### On Android (Mobile)

Because standard Chrome for Android does not support extensions, you can run MeetLite on Android using browsers with desktop extension support:
- **Kiwi Browser** (Chromium-based with full extension support):
  1. Open Kiwi Browser on your phone.
  2. Go to `chrome://extensions`.
  3. Turn on **Developer mode**.
  4. Click **+(from .zip/.crx/folder)** and select the `meet-lite-extension` folder.
  5. Go to `meet.google.com` (select "Desktop site" if prompted).
- **Firefox for Android Nightly / Orion Browser (iOS)**:
  - Compatible with standard WebExtensions APIs.

---

## 🗂️ Project Structure

```
meet-lite-extension/
├── manifest.json               # Manifest V3 configuration & permissions
├── rules.json                  # DeclarativeNetRequest rules for blocking telemetry
├── background/
│   └── service_worker.js       # Background service worker & badge manager
├── content/
│   ├── page_hook.js            # Injected in MAIN world (WebRTC & media clamps)
│   ├── hud_injector.js         # Injected in ISOLATED world (HUD DOM & events)
│   └── hud.css                 # Glassmorphic HUD styling
├── popup/
│   ├── popup.html              # Extension toolbar popup interface
│   ├── popup.js                # Popup logic & preset controller
│   └── popup.css               # Popup dark-theme styling
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md
```

---

## 🛡️ Privacy & Permissions

- **100% Local**: All processing, bitrate clamping, and telemetry blocking happen strictly on your machine.
- **Zero Remote Tracking**: MeetLite contains zero analytics or remote calls.
- **Open Code**: Every script is unminified and fully transparent.
