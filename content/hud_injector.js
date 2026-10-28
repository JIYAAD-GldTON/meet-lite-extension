/**
 * MeetLite - 100% Style-Isolated Spacious HUD Controller
 * Features: Streamlined Compact Metrics, Adjustable Resizing, Shadow DOM Isolation, Master Power Switch.
 * Fully guarded against "Extension context invalidated" errors.
 */

(function () {
  'use strict';

  if (document.getElementById('meet-lite-hud-host')) return;

  // Context validation helper
  function isExtensionValid() {
    try {
      return Boolean(typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id);
    } catch (e) {
      return false;
    }
  }

  function safeStorageSyncSet(data) {
    if (!isExtensionValid()) return;
    try {
      if (chrome.storage && chrome.storage.sync) {
        chrome.storage.sync.set(data);
      }
    } catch (e) {}
  }

  function safeStorageLocalSet(data) {
    if (!isExtensionValid()) return;
    try {
      if (chrome.storage && chrome.storage.local) {
        chrome.storage.local.set(data);
      }
    } catch (e) {}
  }

  function safeSendMessage(msg) {
    if (!isExtensionValid()) return;
    try {
      chrome.runtime.sendMessage(msg, () => {
        if (chrome.runtime.lastError) {} // Consume lastError silently
      });
    } catch (e) {}
  }

  const DEFAULT_CONFIG = {
    enabled: true,
    hudVisible: true,
    preset: 'low',
    outgoingVideoQuality: '180p',
    outgoingMaxFps: 10,
    outgoingVideoMaxKbps: 120,
    incomingVideoMode: 'audio_only',
    audioSaver: true,
    freezeInactiveTab: true,
    isMinimized: false
  };

  let currentConfig = { ...DEFAULT_CONFIG };
  let currentStats = {
    sentKbps: 0,
    recvKbps: 0,
    totalKbps: 0,
    lossPct: '0.0',
    savedMB: '0.0',
    activeConnections: 0
  };

  // Load configuration from storage safely
  if (isExtensionValid() && chrome.storage && chrome.storage.sync) {
    try {
      chrome.storage.sync.get(['meetLiteConfig', 'meetLitePos', 'meetLiteSize'], (result) => {
        if (result && result.meetLiteConfig) {
          currentConfig = { ...DEFAULT_CONFIG, ...result.meetLiteConfig };
        }
        initHUD(result ? result.meetLitePos : null, result ? result.meetLiteSize : null);
        syncConfigToPageHook();
      });
    } catch (e) {
      initHUD();
      syncConfigToPageHook();
    }
  } else {
    initHUD();
    syncConfigToPageHook();
  }

  function syncConfigToPageHook() {
    window.postMessage({
      type: 'MEET_LITE_APPLY_CONFIG',
      config: currentConfig
    }, '*');
  }

  function saveConfig() {
    safeStorageSyncSet({ meetLiteConfig: currentConfig });
    syncConfigToPageHook();
  }

  function initHUD(savedPos, savedSize) {
    const host = document.createElement('div');
    host.id = 'meet-lite-hud-host';
    host.style.position = 'fixed';
    host.style.bottom = '28px';
    host.style.right = '28px';
    host.style.zIndex = '2147483647';
    host.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

    if (!currentConfig.hudVisible) {
      host.style.display = 'none';
    }

    if (savedPos && savedPos.x !== undefined && savedPos.y !== undefined) {
      const safeX = Math.max(10, Math.min(window.innerWidth - 300, savedPos.x));
      const safeY = Math.max(10, Math.min(window.innerHeight - 250, savedPos.y));
      host.style.left = `${safeX}px`;
      host.style.top = `${safeY}px`;
      host.style.right = 'auto';
      host.style.bottom = 'auto';
    }

    // Attach Shadow Root for 100% CSS isolation
    const shadow = host.attachShadow({ mode: 'open' });

    // Inject isolated CSS
    const styleEl = document.createElement('style');
    styleEl.textContent = `
      * {
        box-sizing: border-box !important;
        margin: 0 !important;
        padding: 0 !important;
      }

      .ml-root-wrap {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
        font-size: 13px !important;
        line-height: 1.4 !important;
        color: #0f172a !important;
        user-select: none !important;
      }

      /* Capsule Pill */
      #meet-lite-hud-pill {
        display: flex;
        align-items: center;
        gap: 10px !important;
        padding: 8px 16px !important;
        background: #ffffff !important;
        border: 1px solid #cbd5e1 !important;
        border-radius: 9999px !important;
        box-shadow: 0 8px 20px rgba(0, 0, 0, 0.12) !important;
        cursor: pointer !important;
        white-space: nowrap !important;
      }

      .ml-pill-dot {
        width: 8px !important;
        height: 8px !important;
        border-radius: 50% !important;
        background: #10b981 !important;
        flex-shrink: 0 !important;
      }

      .ml-pill-dot.disabled {
        background: #94a3b8 !important;
      }

      .ml-pill-title {
        font-weight: 800 !important;
        font-size: 12.5px !important;
        color: #0f172a !important;
      }

      .ml-pill-stat {
        font-size: 12.5px !important;
        font-weight: 800 !important;
        color: #2563eb !important;
      }

      /* Adjustable Resizable Card */
      #meet-lite-hud-card {
        width: 360px;
        min-width: 280px !important;
        max-width: 600px !important;
        min-height: 200px !important;
        max-height: 90vh !important;
        display: flex !important;
        flex-direction: column !important;
        background: #ffffff !important;
        border: 1px solid #e2e8f0 !important;
        border-radius: 16px !important;
        box-shadow: 0 16px 36px -8px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(0, 0, 0, 0.04) !important;
        overflow: hidden !important;
        position: relative !important;
        resize: both !important;
      }

      #meet-lite-hud-card.disabled-mode .ml-body-content {
        opacity: 0.45 !important;
        pointer-events: none !important;
      }

      /* Slim, Sleek Header */
      .ml-card-header {
        display: flex !important;
        align-items: center !important;
        justify-content: space-between !important;
        padding: 9px 14px !important;
        background: #f8fafc !important;
        border-bottom: 1px solid #e2e8f0 !important;
        cursor: move !important;
        flex-shrink: 0 !important;
      }

      .ml-header-brand {
        display: flex !important;
        align-items: center !important;
        gap: 8px !important;
      }

      .ml-brand-badge {
        background: #2563eb !important;
        color: #ffffff !important;
        font-weight: 800 !important;
        font-size: 10px !important;
        padding: 2px 5px !important;
        border-radius: 4px !important;
      }

      .ml-brand-name {
        font-size: 13.5px !important;
        font-weight: 800 !important;
        color: #0f172a !important;
      }

      .ml-header-actions {
        display: flex !important;
        align-items: center !important;
        gap: 8px !important;
      }

      /* Master Switch */
      .ml-master-toggle-wrap {
        display: flex !important;
        align-items: center !important;
        gap: 6px !important;
        background: #ffffff !important;
        padding: 2px 8px !important;
        border-radius: 16px !important;
        border: 1px solid #e2e8f0 !important;
      }

      .ml-master-text {
        font-size: 10px !important;
        font-weight: 800 !important;
        color: #10b981 !important;
      }

      .ml-master-text.off {
        color: #64748b !important;
      }

      .ml-master-switch {
        position: relative !important;
        display: inline-block !important;
        width: 30px !important;
        height: 17px !important;
        flex-shrink: 0 !important;
      }

      .ml-master-switch input {
        opacity: 0 !important;
        width: 0 !important;
        height: 0 !important;
      }

      .ml-master-track {
        position: absolute !important;
        cursor: pointer !important;
        top: 0 !important; left: 0 !important; right: 0 !important; bottom: 0 !important;
        background-color: #cbd5e1 !important;
        transition: 0.2s ease !important;
        border-radius: 16px !important;
      }

      .ml-master-track::before {
        position: absolute !important;
        content: "" !important;
        height: 13px !important;
        width: 13px !important;
        left: 2px !important;
        bottom: 2px !important;
        background-color: #ffffff !important;
        transition: 0.2s ease !important;
        border-radius: 50% !important;
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2) !important;
      }

      .ml-master-switch input:checked + .ml-master-track {
        background-color: #10b981 !important;
      }

      .ml-master-switch input:checked + .ml-master-track::before {
        transform: translateX(13px) !important;
      }

      .ml-btn-icon {
        background: transparent !important;
        border: none !important;
        color: #64748b !important;
        width: 24px !important;
        height: 24px !important;
        border-radius: 5px !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        cursor: pointer !important;
        font-size: 13px !important;
        font-weight: bold !important;
      }

      .ml-btn-icon:hover {
        background: #e2e8f0 !important;
        color: #0f172a !important;
      }

      /* Body Content */
      .ml-body-content {
        display: flex !important;
        flex-direction: column !important;
        flex: 1 1 auto !important;
        overflow: hidden !important;
      }

      /* Streamlined Compact Metrics Row */
      .ml-meter-section {
        padding: 8px 14px !important;
        background: #f8fafc !important;
        border-bottom: 1px solid #e2e8f0 !important;
        flex-shrink: 0 !important;
      }

      .ml-meter-row {
        display: grid !important;
        grid-template-columns: 1fr 1fr 1.05fr !important;
        gap: 8px !important;
      }

      .ml-chip {
        background: #ffffff !important;
        border: 1px solid #e2e8f0 !important;
        border-radius: 8px !important;
        padding: 5px 6px !important;
        display: flex !important;
        flex-direction: column !important;
        align-items: center !important;
        text-align: center !important;
      }

      .ml-chip.saved {
        background: #f0fdf4 !important;
        border-color: #bbf7d0 !important;
      }

      .ml-chip-lbl {
        font-size: 9px !important;
        font-weight: 700 !important;
        text-transform: uppercase !important;
        letter-spacing: 0.3px !important;
        color: #64748b !important;
        margin-bottom: 1px !important;
        display: flex !important;
        align-items: center !important;
        gap: 3px !important;
      }

      .ml-chip.saved .ml-chip-lbl {
        color: #166534 !important;
      }

      .ml-chip-val {
        font-size: 13px !important;
        font-weight: 800 !important;
        color: #0f172a !important;
        font-feature-settings: "tnum" !important;
        white-space: nowrap !important;
      }

      .ml-chip-val.sent {
        color: #7c3aed !important;
      }

      .ml-chip-val.recv {
        color: #0284c7 !important;
      }

      .ml-chip-val.saved {
        color: #15803d !important;
      }

      /* Presets */
      .ml-presets-area {
        padding: 10px 14px 8px !important;
        flex-shrink: 0 !important;
      }

      .ml-presets-label {
        font-size: 10px !important;
        font-weight: 700 !important;
        text-transform: uppercase !important;
        letter-spacing: 0.5px !important;
        color: #64748b !important;
        margin-bottom: 6px !important;
      }

      .ml-presets-grid {
        display: grid !important;
        grid-template-columns: repeat(3, 1fr) !important;
        gap: 8px !important;
      }

      .ml-preset-chip {
        background: #f8fafc !important;
        border: 1px solid #cbd5e1 !important;
        border-radius: 8px !important;
        padding: 7px 4px !important;
        font-size: 11px !important;
        font-weight: 700 !important;
        color: #334155 !important;
        text-align: center !important;
        cursor: pointer !important;
      }

      .ml-preset-chip:hover {
        background: #e2e8f0 !important;
        color: #0f172a !important;
      }

      .ml-preset-chip.active {
        background: #2563eb !important;
        border-color: #2563eb !important;
        color: #ffffff !important;
        box-shadow: 0 2px 8px rgba(37, 99, 235, 0.2) !important;
      }

      .ml-preset-sub {
        font-size: 9px !important;
        display: block !important;
        opacity: 0.9 !important;
        margin-top: 1px !important;
        font-weight: 500 !important;
      }

      /* Controls Scroll Area */
      .ml-controls-scroll {
        flex: 1 1 auto !important;
        overflow-y: auto !important;
        padding: 4px 14px 10px !important;
      }

      .ml-control-row {
        margin-bottom: 12px !important;
      }

      .ml-control-header {
        display: flex !important;
        align-items: center !important;
        justify-content: space-between !important;
        margin-bottom: 5px !important;
      }

      .ml-control-title {
        font-size: 11.5px !important;
        font-weight: 700 !important;
        color: #1e293b !important;
      }

      .ml-saving-tag {
        font-size: 9.5px !important;
        font-weight: 700 !important;
        color: #15803d !important;
        background: #dcfce7 !important;
        padding: 1px 6px !important;
        border-radius: 4px !important;
      }

      .ml-btn-group {
        display: flex !important;
        background: #f1f5f9 !important;
        border: 1px solid #e2e8f0 !important;
        padding: 2px !important;
        border-radius: 8px !important;
        gap: 2px !important;
      }

      .ml-grp-btn {
        flex: 1 !important;
        background: transparent !important;
        border: none !important;
        color: #64748b !important;
        padding: 6px 3px !important;
        font-size: 11px !important;
        font-weight: 700 !important;
        border-radius: 6px !important;
        cursor: pointer !important;
        text-align: center !important;
      }

      .ml-grp-btn:hover {
        color: #0f172a !important;
      }

      .ml-grp-btn.active {
        background: #ffffff !important;
        color: #0f172a !important;
        font-weight: 800 !important;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08) !important;
      }

      .ml-toggle-row {
        display: flex !important;
        align-items: center !important;
        justify-content: space-between !important;
        padding: 8px 0 !important;
        border-bottom: 1px solid #f1f5f9 !important;
      }

      .ml-toggle-label {
        font-size: 11.5px !important;
        font-weight: 700 !important;
        color: #1e293b !important;
      }

      .ml-toggle-sub {
        font-size: 10px !important;
        color: #64748b !important;
      }

      .ml-switch-lite {
        position: relative !important;
        display: inline-block !important;
        width: 34px !important;
        height: 19px !important;
        flex-shrink: 0 !important;
      }

      .ml-switch-lite input {
        opacity: 0 !important;
        width: 0 !important;
        height: 0 !important;
      }

      .ml-switch-track {
        position: absolute !important;
        cursor: pointer !important;
        top: 0 !important; left: 0 !important; right: 0 !important; bottom: 0 !important;
        background-color: #cbd5e1 !important;
        transition: 0.2s ease !important;
        border-radius: 16px !important;
      }

      .ml-switch-track::before {
        position: absolute !important;
        content: "" !important;
        height: 15px !important;
        width: 15px !important;
        left: 2px !important;
        bottom: 2px !important;
        background-color: #ffffff !important;
        transition: 0.2s ease !important;
        border-radius: 50% !important;
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2) !important;
      }

      input:checked + .ml-switch-track {
        background-color: #10b981 !important;
      }

      input:checked + .ml-switch-track::before {
        transform: translateX(15px) !important;
      }

      /* Footer */
      .ml-card-footer {
        padding: 5px 12px !important;
        background: #f8fafc !important;
        border-top: 1px solid #e2e8f0 !important;
        display: flex !important;
        align-items: center !important;
        justify-content: flex-start !important;
        flex-shrink: 0 !important;
        position: relative !important;
      }

      .ml-tracker-tag {
        font-size: 9.5px !important;
        color: #64748b !important;
        display: inline-flex !important;
        align-items: center !important;
        gap: 3px !important;
        opacity: 0.9 !important;
      }

      .ml-tracker-tag strong {
        color: #10b981 !important;
        font-weight: 700 !important;
      }

      .ml-resize-grip {
        position: absolute !important;
        bottom: 2px !important;
        right: 2px !important;
        width: 14px !important;
        height: 14px !important;
        cursor: nwse-resize !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        opacity: 0.5 !important;
        transition: opacity 0.15s ease !important;
      }

      .ml-resize-grip:hover {
        opacity: 1 !important;
      }
    `;

    shadow.appendChild(styleEl);

    const isOff = currentConfig.enabled === false;

    const wrapper = document.createElement('div');
    wrapper.className = 'ml-root-wrap';
    wrapper.innerHTML = `
      <!-- Minimized Capsule Pill -->
      <div id="meet-lite-hud-pill" style="display: ${currentConfig.isMinimized ? 'flex' : 'none'};">
        <div class="ml-pill-dot ${isOff ? 'disabled' : ''}"></div>
        <span class="ml-pill-title">MeetLite</span>
        <span class="ml-pill-stat" id="ml-pill-stat">${isOff ? 'OFF' : '0 Kbps'}</span>
      </div>

      <!-- Adjustable Resizable Card -->
      <div id="meet-lite-hud-card" class="${isOff ? 'disabled-mode' : ''}" style="display: ${currentConfig.isMinimized ? 'none' : 'flex'};">
        
        <!-- Header -->
        <div class="ml-card-header" id="ml-drag-header">
          <div class="ml-header-brand">
            <span class="ml-brand-badge">LITE</span>
            <span class="ml-brand-name">MeetLite</span>
          </div>

          <div class="ml-header-actions">
            <!-- Master ON/OFF Switch -->
            <div class="ml-master-toggle-wrap" title="Enable or Disable MeetLite entirely">
              <span class="ml-master-text ${isOff ? 'off' : ''}" id="ml-master-status-text">${isOff ? 'OFF' : 'ACTIVE'}</span>
              <label class="ml-master-switch">
                <input type="checkbox" id="ml-chk-master" ${isOff ? '' : 'checked'}>
                <span class="ml-master-track"></span>
              </label>
            </div>

            <!-- Minimize Button -->
            <button class="ml-btn-icon" id="ml-btn-minimize" title="Minimize to capsule">−</button>

            <!-- Close Button -->
            <button class="ml-btn-icon" id="ml-btn-close" title="Hide HUD">✕</button>
          </div>
        </div>

        <!-- Body Content -->
        <div class="ml-body-content">
          <!-- Streamlined Compact Metric Strip -->
          <div class="ml-meter-section">
            <div class="ml-meter-row">
              <div class="ml-chip">
                <span class="ml-chip-lbl">⬆ Up</span>
                <span class="ml-chip-val sent" id="ml-val-sent">0 Kbps</span>
              </div>
              <div class="ml-chip">
                <span class="ml-chip-lbl">⬇ Down</span>
                <span class="ml-chip-val recv" id="ml-val-recv">0 Kbps</span>
              </div>
              <div class="ml-chip saved">
                <span class="ml-chip-lbl">⚡ Saved</span>
                <span class="ml-chip-val saved" id="ml-val-saved">~0 MB</span>
              </div>
            </div>
          </div>

          <!-- Presets -->
          <div class="ml-presets-area">
            <div class="ml-presets-label">Preset Modes</div>
            <div class="ml-presets-grid">
              <button class="ml-preset-chip ${currentConfig.preset === 'ultra' ? 'active' : ''}" data-preset="ultra">
                ⚡ Ultra
                <span class="ml-preset-sub">~40 Kbps</span>
              </button>
              <button class="ml-preset-chip ${currentConfig.preset === 'low' ? 'active' : ''}" data-preset="low">
                🛡️ Low
                <span class="ml-preset-sub">~180 Kbps</span>
              </button>
              <button class="ml-preset-chip ${currentConfig.preset === 'balanced' ? 'active' : ''}" data-preset="balanced">
                ⚖️ Balanced
                <span class="ml-preset-sub">~600 Kbps</span>
              </button>
            </div>
          </div>

          <!-- Controls Scroll Area -->
          <div class="ml-controls-scroll">
            <!-- Camera Quality -->
            <div class="ml-control-row">
              <div class="ml-control-header">
                <span class="ml-control-title">Camera Quality</span>
                <span class="ml-saving-tag">Saves ~1.5 Mbps</span>
              </div>
              <div class="ml-btn-group" id="ml-grp-video">
                <button class="ml-grp-btn ${currentConfig.outgoingVideoQuality === 'off' ? 'active' : ''}" data-val="off">OFF</button>
                <button class="ml-grp-btn ${currentConfig.outgoingVideoQuality === '180p' ? 'active' : ''}" data-val="180p">180p</button>
                <button class="ml-grp-btn ${currentConfig.outgoingVideoQuality === '360p' ? 'active' : ''}" data-val="360p">360p</button>
                <button class="ml-grp-btn ${currentConfig.outgoingVideoQuality === '720p' ? 'active' : ''}" data-val="720p">720p</button>
              </div>
            </div>

            <!-- Frame Rate -->
            <div class="ml-control-row">
              <div class="ml-control-header">
                <span class="ml-control-title">Frame Rate</span>
                <span class="ml-saving-tag">Saves 50%</span>
              </div>
              <div class="ml-btn-group" id="ml-grp-fps">
                <button class="ml-grp-btn ${currentConfig.outgoingMaxFps === 5 ? 'active' : ''}" data-val="5">5 fps</button>
                <button class="ml-grp-btn ${currentConfig.outgoingMaxFps === 10 ? 'active' : ''}" data-val="10">10 fps</button>
                <button class="ml-grp-btn ${currentConfig.outgoingMaxFps === 15 ? 'active' : ''}" data-val="15">15 fps</button>
                <button class="ml-grp-btn ${currentConfig.outgoingMaxFps === 30 ? 'active' : ''}" data-val="30">30 fps</button>
              </div>
            </div>

            <!-- Remote Participants -->
            <div class="ml-control-row">
              <div class="ml-control-header">
                <span class="ml-control-title">Remote Participants</span>
                <span class="ml-saving-tag">Saves 2–5 Mbps</span>
              </div>
              <div class="ml-btn-group" id="ml-grp-remote">
                <button class="ml-grp-btn ${currentConfig.incomingVideoMode === 'audio_only' ? 'active' : ''}" data-val="audio_only">Audio Only</button>
                <button class="ml-grp-btn ${currentConfig.incomingVideoMode === 'low' ? 'active' : ''}" data-val="low">Low Res</button>
                <button class="ml-grp-btn ${currentConfig.incomingVideoMode === 'normal' ? 'active' : ''}" data-val="normal">Normal</button>
              </div>
            </div>

            <!-- Opus Audio Saver -->
            <div class="ml-toggle-row">
              <div>
                <div class="ml-toggle-label">Opus Voice Saver (20 Kbps)</div>
                <div class="ml-toggle-sub">Cuts audio bandwidth by 60%</div>
              </div>
              <label class="ml-switch-lite">
                <input type="checkbox" id="ml-chk-audio" ${currentConfig.audioSaver ? 'checked' : ''}>
                <span class="ml-switch-track"></span>
              </label>
            </div>

            <!-- Inactive Tab Auto Freeze -->
            <div class="ml-toggle-row">
              <div>
                <div class="ml-toggle-label">Auto-Freeze in Background</div>
                <div class="ml-toggle-sub">Saves 100% video when tab is hidden</div>
              </div>
              <label class="ml-switch-lite">
                <input type="checkbox" id="ml-chk-freeze" ${currentConfig.freezeInactiveTab ? 'checked' : ''}>
                <span class="ml-switch-track"></span>
              </label>
            </div>
          </div>

          <!-- Footer with Shrunk Tracker Status and Resize Grip -->
          <div class="ml-card-footer">
            <span class="ml-tracker-tag">Trackers: <strong>Blocked</strong></span>
            <!-- Interactive Resize Grip -->
            <div class="ml-resize-grip" id="ml-resize-grip" title="Drag to resize HUD">
              <svg viewBox="0 0 16 16" width="10" height="10">
                <line x1="14" y1="14" x2="6" y2="14" stroke="#94a3b8" stroke-width="2" stroke-linecap="round"/>
                <line x1="14" y1="10" x2="10" y2="14" stroke="#94a3b8" stroke-width="2" stroke-linecap="round"/>
              </svg>
            </div>
          </div>
        </div>
      </div>
    `;

    shadow.appendChild(wrapper);
    document.body.appendChild(host);

    const card = shadow.querySelector('#meet-lite-hud-card');

    // Apply saved custom size if available
    if (savedSize && savedSize.width) {
      card.style.width = `${Math.max(280, Math.min(600, savedSize.width))}px`;
      if (savedSize.height) {
        card.style.height = `${Math.max(200, Math.min(window.innerHeight - 60, savedSize.height))}px`;
      }
    }

    setupEvents(shadow, host, card);
  }

  function setupEvents(shadow, host, card) {
    const pill = shadow.querySelector('#meet-lite-hud-pill');
    const minBtn = shadow.querySelector('#ml-btn-minimize');
    const closeBtn = shadow.querySelector('#ml-btn-close');
    const dragHeader = shadow.querySelector('#ml-drag-header');
    const chkMaster = shadow.querySelector('#ml-chk-master');
    const masterStatusText = shadow.querySelector('#ml-master-status-text');
    const resizeGrip = shadow.querySelector('#ml-resize-grip');

    // Master Switch Toggle (Enable / Disable)
    chkMaster.addEventListener('change', () => {
      currentConfig.enabled = chkMaster.checked;
      if (currentConfig.enabled) {
        card.classList.remove('disabled-mode');
        masterStatusText.textContent = 'ACTIVE';
        masterStatusText.classList.remove('off');
        shadow.querySelector('.ml-pill-dot').classList.remove('disabled');
      } else {
        card.classList.add('disabled-mode');
        masterStatusText.textContent = 'OFF';
        masterStatusText.classList.add('off');
        shadow.querySelector('.ml-pill-dot').classList.add('disabled');
      }
      saveConfig();
    });

    // Minimize / Expand
    minBtn.addEventListener('click', () => {
      card.style.display = 'none';
      pill.style.display = 'flex';
      currentConfig.isMinimized = true;
      saveConfig();
    });

    pill.addEventListener('click', () => {
      pill.style.display = 'none';
      card.style.display = 'flex';
      currentConfig.isMinimized = false;
      saveConfig();
    });

    // Close / Hide completely
    closeBtn.addEventListener('click', () => {
      host.style.display = 'none';
      currentConfig.hudVisible = false;
      saveConfig();
    });

    // Corner Grip Resizing
    let isResizing = false;
    let startResizeX = 0, startResizeY = 0, startW = 0, startH = 0;

    resizeGrip.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      isResizing = true;
      startResizeX = e.clientX;
      startResizeY = e.clientY;
      startW = card.offsetWidth;
      startH = card.offsetHeight;

      const onMouseMoveResize = (ev) => {
        if (!isResizing) return;
        const newW = Math.max(280, Math.min(600, startW + (ev.clientX - startResizeX)));
        const newH = Math.max(200, Math.min(window.innerHeight - 80, startH + (ev.clientY - startResizeY)));
        card.style.width = `${newW}px`;
        card.style.height = `${newH}px`;
      };

      const onMouseUpResize = () => {
        if (!isResizing) return;
        isResizing = false;
        document.removeEventListener('mousemove', onMouseMoveResize);
        document.removeEventListener('mouseup', onMouseUpResize);

        safeStorageSyncSet({
          meetLiteSize: { width: card.offsetWidth, height: card.offsetHeight }
        });
      };

      document.addEventListener('mousemove', onMouseMoveResize);
      document.addEventListener('mouseup', onMouseUpResize);
    });

    // Native CSS resize observer
    let resizeTimer = null;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (isResizing) return;
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
          if (card.offsetWidth > 200) {
            safeStorageSyncSet({
              meetLiteSize: { width: card.offsetWidth, height: card.offsetHeight }
            });
          }
        }, 500);
      }
    });
    ro.observe(card);

    // Dragging
    let isDragging = false;
    let startX = 0, startY = 0, origX = 0, origY = 0;

    dragHeader.addEventListener('mousedown', (e) => {
      if (e.target.closest('button, label, input')) return;
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      const rect = host.getBoundingClientRect();
      origX = rect.left;
      origY = rect.top;

      const onMouseMove = (ev) => {
        if (!isDragging) return;
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;

        const maxW = currentConfig.isMinimized ? 160 : card.offsetWidth;
        const maxH = currentConfig.isMinimized ? 60 : card.offsetHeight;

        const safeX = Math.max(10, Math.min(window.innerWidth - maxW, origX + dx));
        const safeY = Math.max(10, Math.min(window.innerHeight - maxH, origY + dy));

        host.style.left = `${safeX}px`;
        host.style.top = `${safeY}px`;
        host.style.right = 'auto';
        host.style.bottom = 'auto';
      };

      const onMouseUp = () => {
        if (!isDragging) return;
        isDragging = false;
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);

        const rect = host.getBoundingClientRect();
        safeStorageSyncSet({ meetLitePos: { x: rect.left, y: rect.top } });
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });

    // Presets
    const presetChips = shadow.querySelectorAll('.ml-preset-chip');
    presetChips.forEach((chip) => {
      chip.addEventListener('click', () => {
        const preset = chip.getAttribute('data-preset');
        applyPreset(preset, shadow);
      });
    });

    // Button groups
    bindButtonGroup(shadow, '#ml-grp-video', (val) => {
      currentConfig.outgoingVideoQuality = val;
      if (val === 'off') currentConfig.outgoingVideoMaxKbps = 10;
      else if (val === '180p') currentConfig.outgoingVideoMaxKbps = 120;
      else if (val === '360p') currentConfig.outgoingVideoMaxKbps = 350;
      else currentConfig.outgoingVideoMaxKbps = 1500;

      currentConfig.preset = 'custom';
      updatePresetUI(shadow, 'custom');
      saveConfig();
    });

    bindButtonGroup(shadow, '#ml-grp-fps', (val) => {
      currentConfig.outgoingMaxFps = parseInt(val, 10);
      currentConfig.preset = 'custom';
      updatePresetUI(shadow, 'custom');
      saveConfig();
    });

    bindButtonGroup(shadow, '#ml-grp-remote', (val) => {
      currentConfig.incomingVideoMode = val;
      currentConfig.preset = 'custom';
      updatePresetUI(shadow, 'custom');
      saveConfig();
    });

    // Checkboxes
    const chkAudio = shadow.querySelector('#ml-chk-audio');
    chkAudio.addEventListener('change', () => {
      currentConfig.audioSaver = chkAudio.checked;
      saveConfig();
    });

    const chkFreeze = shadow.querySelector('#ml-chk-freeze');
    chkFreeze.addEventListener('change', () => {
      currentConfig.freezeInactiveTab = chkFreeze.checked;
      saveConfig();
    });
  }

  function bindButtonGroup(shadow, selector, onChange) {
    const container = shadow.querySelector(selector);
    if (!container) return;
    const buttons = container.querySelectorAll('.ml-grp-btn');
    buttons.forEach((btn) => {
      btn.addEventListener('click', () => {
        buttons.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        onChange(btn.getAttribute('data-val'));
      });
    });
  }

  function updatePresetUI(shadow, activePreset) {
    const chips = shadow.querySelectorAll('.ml-preset-chip');
    chips.forEach((c) => {
      if (c.getAttribute('data-preset') === activePreset) {
        c.classList.add('active');
      } else {
        c.classList.remove('active');
      }
    });
  }

  function applyPreset(preset, shadow) {
    currentConfig.preset = preset;

    if (preset === 'ultra') {
      currentConfig.outgoingVideoQuality = 'off';
      currentConfig.outgoingMaxFps = 5;
      currentConfig.outgoingVideoMaxKbps = 20;
      currentConfig.incomingVideoMode = 'audio_only';
      currentConfig.audioSaver = true;
      currentConfig.freezeInactiveTab = true;
    } else if (preset === 'low') {
      currentConfig.outgoingVideoQuality = '180p';
      currentConfig.outgoingMaxFps = 10;
      currentConfig.outgoingVideoMaxKbps = 120;
      currentConfig.incomingVideoMode = 'audio_only';
      currentConfig.audioSaver = true;
      currentConfig.freezeInactiveTab = true;
    } else if (preset === 'balanced') {
      currentConfig.outgoingVideoQuality = '360p';
      currentConfig.outgoingMaxFps = 15;
      currentConfig.outgoingVideoMaxKbps = 400;
      currentConfig.incomingVideoMode = 'low';
      currentConfig.audioSaver = false;
      currentConfig.freezeInactiveTab = true;
    }

    updatePresetUI(shadow, preset);
    syncActive(shadow, '#ml-grp-video', currentConfig.outgoingVideoQuality);
    syncActive(shadow, '#ml-grp-fps', currentConfig.outgoingMaxFps.toString());
    syncActive(shadow, '#ml-grp-remote', currentConfig.incomingVideoMode);

    shadow.querySelector('#ml-chk-audio').checked = currentConfig.audioSaver;
    shadow.querySelector('#ml-chk-freeze').checked = currentConfig.freezeInactiveTab;

    saveConfig();
  }

  function syncActive(shadow, selector, val) {
    const container = shadow.querySelector(selector);
    if (!container) return;
    container.querySelectorAll('.ml-grp-btn').forEach((b) => {
      if (b.getAttribute('data-val') === val) b.classList.add('active');
      else b.classList.remove('active');
    });
  }

  // Live Telemetry Receiver with context invalidation protection
  window.addEventListener('message', (event) => {
    if (!event.data || event.data.type !== 'MEET_LITE_STATS') return;
    currentStats = event.data.data;

    const host = document.getElementById('meet-lite-hud-host');
    if (!host || !host.shadowRoot) return;
    const shadow = host.shadowRoot;

    const sentEl = shadow.getElementById('ml-val-sent');
    const recvEl = shadow.getElementById('ml-val-recv');
    const savedEl = shadow.getElementById('ml-val-saved');
    const pillStat = shadow.getElementById('ml-pill-stat');

    if (sentEl) sentEl.textContent = `${currentStats.sentKbps} Kbps`;
    if (recvEl) recvEl.textContent = `${currentStats.recvKbps} Kbps`;
    if (savedEl) savedEl.textContent = `~${currentStats.savedMB || 0} MB`;
    if (pillStat) {
      pillStat.textContent = currentConfig.enabled === false ? 'OFF' : `${currentStats.totalKbps} Kbps`;
    }

    // Safely persist to storage
    safeStorageLocalSet({ meetLiteLatestStats: currentStats });
    safeSendMessage({ type: 'MEET_LITE_STATS_UPDATE', stats: currentStats });
  });

  // Direct response to popup queries
  if (isExtensionValid() && chrome.runtime && chrome.runtime.onMessage) {
    try {
      chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
        if (req.type === 'MEET_LITE_QUERY_STATS') {
          sendResponse({ stats: currentStats, config: currentConfig });
        } else if (req.type === 'MEET_LITE_SET_HUD_VISIBLE') {
          currentConfig.hudVisible = req.visible;
          const host = document.getElementById('meet-lite-hud-host');
          if (host) {
            host.style.display = req.visible ? 'block' : 'none';
          }
          saveConfig();
          sendResponse({ ok: true });
        }
      });
    } catch (e) {}
  }

})();
