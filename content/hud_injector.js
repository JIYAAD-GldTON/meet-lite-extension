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
    isMinimized: false,
    showGraph: true,
    screenShareQuality: 'saver', // Remote screen share ('hd', 'saver', 'freeze', 'off')
    myScreenShareQuality: 'text', // My screen share ('text', '720p', 'low', 'hd')
    preset: 'low',
    outgoingVideoQuality: '180p',
    outgoingMaxFps: 10,
    outgoingVideoMaxKbps: 120,
    incomingVideoMode: 'audio_only',
    audioSaver: true,
    freezeInactiveTab: true
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
    if (!document.body) {
      document.addEventListener('DOMContentLoaded', () => initHUD(savedPos, savedSize), { once: true });
      return;
    }

    const existing = document.getElementById('meet-lite-hud-host');
    if (existing) {
      existing.remove();
    }

    const host = document.createElement('div');
    host.id = 'meet-lite-hud-host';
    host.style.position = 'fixed';
    host.style.bottom = '28px';
    host.style.right = '28px';
    host.style.zIndex = '2147483647';
    host.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

    if (savedPos && savedPos.x !== undefined && savedPos.y !== undefined) {
      const safeX = Math.max(10, Math.min(window.innerWidth - 300, savedPos.x));
      const safeY = Math.max(10, Math.min(window.innerHeight - 250, savedPos.y));
      host.style.left = `${safeX}px`;
      host.style.top = `${safeY}px`;
      host.style.right = 'auto';
      host.style.bottom = 'auto';
    }

    if (!currentConfig.hudVisible) {
      host.style.display = 'none';
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
        transition: transform 0.15s ease, box-shadow 0.15s ease, background-color 0.15s ease !important;
      }

      #meet-lite-hud-pill:hover {
        background: #f8fafc !important;
        border-color: #94a3b8 !important;
        box-shadow: 0 10px 24px rgba(0, 0, 0, 0.16) !important;
        transform: translateY(-1px) !important;
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

      .ml-mini-graph-wrap {
        margin-top: 6px !important;
        background: #f1f5f9 !important;
        border: 1px solid #e2e8f0 !important;
        border-radius: 7px !important;
        padding: 4px 8px 3px !important;
      }

      .ml-mini-graph-head {
        display: flex !important;
        align-items: center !important;
        justify-content: space-between !important;
        font-size: 9px !important;
        color: #64748b !important;
        font-weight: 700 !important;
        margin-bottom: 2px !important;
      }

      .ml-mini-legend {
        display: flex !important;
        align-items: center !important;
        gap: 6px !important;
        font-size: 8px !important;
        color: #475569 !important;
      }

      .ml-mini-legend span[class^="dot-"] {
        display: inline-block !important;
        width: 5px !important;
        height: 5px !important;
        border-radius: 50% !important;
        margin-right: 2px !important;
      }

      .dot-up { background: #2563eb !important; }
      .dot-down { background: #10b981 !important; }
      .dot-base { background: #ef4444 !important; }

      #ml-mini-canvas {
        width: 100% !important;
        height: 44px !important;
        display: block !important;
        border-radius: 4px !important;
        background: #ffffff !important;
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

      /* Google Server Cap UI */
      .ml-server-cap-wrap {
        display: flex !important;
        gap: 6px !important;
        margin-top: 5px !important;
      }

      .ml-btn-server-action {
        flex: 1 !important;
        background: #f8fafc !important;
        border: 1px solid #cbd5e1 !important;
        border-radius: 6px !important;
        padding: 5px 8px !important;
        font-size: 11px !important;
        font-weight: 700 !important;
        color: #1e293b !important;
        cursor: pointer !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        gap: 4px !important;
        transition: all 0.15s ease !important;
      }

      .ml-btn-server-action:hover {
        background: #e2e8f0 !important;
        border-color: #94a3b8 !important;
      }

      .ml-btn-server-action.active {
        background: #ecfdf5 !important;
        border-color: #10b981 !important;
        color: #047857 !important;
        box-shadow: 0 1px 3px rgba(16, 185, 129, 0.2) !important;
      }

      .ml-server-cap-status {
        font-size: 9.5px !important;
        color: #64748b !important;
        margin-top: 4px !important;
        line-height: 1.3 !important;
        font-style: italic !important;
      }
    `;

    shadow.appendChild(styleEl);

    const isOff = currentConfig.enabled === false;
    const isMin = Boolean(currentConfig.isMinimized);

    const wrapper = document.createElement('div');
    wrapper.className = 'ml-root-wrap';
    wrapper.innerHTML = `
      <!-- Capsule Pill (Minimized Floating Box) -->
      <div id="meet-lite-hud-pill" style="display: ${isMin ? 'flex' : 'none'};" title="Click to expand MeetLite HUD (or drag to reposition)">
        <div class="ml-pill-dot ${isOff ? 'disabled' : ''}"></div>
        <span class="ml-pill-title">MeetLite</span>
        <span class="ml-pill-stat" id="ml-pill-stat">${isOff ? 'OFF' : `${currentStats.totalKbps || 0} Kbps`}</span>
      </div>

      <!-- Adjustable Resizable Card -->
      <div id="meet-lite-hud-card" class="${isOff ? 'disabled-mode' : ''}" style="display: ${isMin ? 'none' : 'flex'};">
        
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
            <button class="ml-btn-icon" id="ml-btn-minimize" title="Minimize to floating pill">−</button>

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

            <!-- In-Call Real-Time Rolling Mini Graph -->
            <div class="ml-mini-graph-wrap" id="ml-mini-graph-wrap" title="Live 60s WebRTC Bandwidth Chart" style="display: ${currentConfig.showGraph !== false ? 'block' : 'none'};">
              <div class="ml-mini-graph-head">
                <span>Bandwidth (60s)</span>
                <div class="ml-mini-legend">
                  <span><span class="dot-up"></span>Up</span>
                  <span><span class="dot-down"></span>Down</span>
                  <span><span class="dot-base"></span>~3.2M</span>
                </div>
              </div>
              <canvas id="ml-mini-canvas" width="310" height="44"></canvas>
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

            <!-- Remote Screen Share Quality (View) -->
            <div class="ml-control-row">
              <div class="ml-control-header">
                <span class="ml-control-title">Remote Screen Share (View)</span>
                <span class="ml-saving-tag" id="ml-tag-screenshare">
                  ${currentConfig.screenShareQuality === 'freeze' ? '❄️ Frozen' : (currentConfig.screenShareQuality === 'saver' ? 'Saves 60%' : (currentConfig.screenShareQuality === 'off' ? 'Disabled' : 'Full HD'))}
                </span>
              </div>
              <div class="ml-btn-group" id="ml-grp-screenshare">
                <button class="ml-grp-btn ${(currentConfig.screenShareQuality || 'saver') === 'hd' ? 'active' : ''}" data-val="hd" title="Full 1080p/720p original quality">HD</button>
                <button class="ml-grp-btn ${(currentConfig.screenShareQuality || 'saver') === 'saver' ? 'active' : ''}" data-val="saver" title="Sharp text with slide-saver 5fps pacing">Saver</button>
                <button class="ml-grp-btn ${currentConfig.screenShareQuality === 'freeze' ? 'active' : ''}" data-val="freeze" title="Freeze on current slide (stops 100% video)">Freeze</button>
                <button class="ml-grp-btn ${currentConfig.screenShareQuality === 'off' ? 'active' : ''}" data-val="off" title="Turn off screen share stream">OFF</button>
              </div>
            </div>

            <!-- My Screen Share Quality (Upload) -->
            <div class="ml-control-row">
              <div class="ml-control-header">
                <span class="ml-control-title">My Screen Share (Upload)</span>
                <span class="ml-saving-tag" id="ml-tag-my-screenshare">
                  ${currentConfig.myScreenShareQuality === 'hd' ? 'Full 1080p' : (currentConfig.myScreenShareQuality === '720p' ? 'Balanced &bull; Saves 60%' : (currentConfig.myScreenShareQuality === 'low' ? 'Low &bull; Saves 90%' : 'Sharp Text &bull; Saves 80%'))}
                </span>
              </div>
              <div class="ml-btn-group" id="ml-grp-my-screenshare">
                <button class="ml-grp-btn ${(currentConfig.myScreenShareQuality || 'text') === 'text' ? 'active' : ''}" data-val="text" title="Full 1080p crisp text @ 5 fps &mdash; saves 80% upload data for slides and code">Text 5fps</button>
                <button class="ml-grp-btn ${currentConfig.myScreenShareQuality === '720p' ? 'active' : ''}" data-val="720p" title="720p resolution @ 15 fps &mdash; balanced presentation mode">720p</button>
                <button class="ml-grp-btn ${currentConfig.myScreenShareQuality === 'low' ? 'active' : ''}" data-val="low" title="480p resolution @ 5 fps &mdash; saves 90% upload data">Low</button>
                <button class="ml-grp-btn ${currentConfig.myScreenShareQuality === 'hd' ? 'active' : ''}" data-val="hd" title="Full original uncapped quality (up to 1080p @ 30fps)">Full HD</button>
              </div>
            </div>

            <!-- Google Server Cap (SFU Cloud Automation) -->
            <div class="ml-control-row">
              <div class="ml-control-header">
                <span class="ml-control-title">Google Server Cap (SFU)</span>
                <span class="ml-saving-tag" id="ml-tag-server-cap">Cloud Stop</span>
              </div>
              <div class="ml-server-cap-wrap">
                <button class="ml-btn-server-action" id="ml-btn-cap-360p" title="Instruct Google cloud server to cap incoming video at 360p">
                  ⚡ Cap 360p
                </button>
                <button class="ml-btn-server-action" id="ml-btn-cap-audio" title="Instruct Google cloud server to stop incoming video (Audio Only)">
                  🔇 Audio Only
                </button>
              </div>
              <div class="ml-server-cap-status" id="ml-server-cap-status">
                Tells Google servers to stop transmitting 1080p/720p packets
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

            <!-- Bandwidth Graph Toggle -->
            <div class="ml-toggle-row">
              <div>
                <div class="ml-toggle-label">Bandwidth Graph</div>
                <div class="ml-toggle-sub">Show rolling chart inside HUD</div>
              </div>
              <label class="ml-switch-lite">
                <input type="checkbox" id="ml-chk-graph" ${currentConfig.showGraph !== false ? 'checked' : ''}>
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

  // -------------------------------------------------------------
  // Google Meet Native Server-Side SFU Receive Resolution Auto-Cap
  // Silently navigates: Bottom Bar ⋮ → Settings → Video → Receive resolution
  // Instructs Google's SFU media servers to cut 1080p/720p streams at the cloud source
  // -------------------------------------------------------------
  let isCappingServer = false;

  function ensureSilentConfigStyle() {
    if (document.getElementById('meet-lite-silent-style')) return;
    const style = document.createElement('style');
    style.id = 'meet-lite-silent-style';
    style.textContent = `
      body.ml-silent-config [role="dialog"],
      body.ml-silent-config [role="menu"] {
        opacity: 0.05 !important;
        pointer-events: auto !important;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Polling helper: resolves as soon as predicate returns a truthy value
  async function waitFor(predicate, maxWaitMs = 2500, intervalMs = 60) {
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
      try {
        const res = predicate();
        if (res) return res;
      } catch (e) {}
      await sleep(intervalMs);
    }
    return null;
  }

  // Full-event click simulation for Google Closure & Material Web Components
  function simulateClick(el) {
    if (!el) return;
    try {
      el.focus();
      const opts = { bubbles: true, cancelable: true, view: window };
      el.dispatchEvent(new PointerEvent('pointerdown', opts));
      el.dispatchEvent(new MouseEvent('mousedown', opts));
      el.dispatchEvent(new PointerEvent('pointerup', opts));
      el.dispatchEvent(new MouseEvent('mouseup', opts));
      el.click();
    } catch (e) {
      el.click();
    }
  }

  function findCenterBarMoreOptionsButton() {
    const buttons = Array.from(document.querySelectorAll('button, [role="button"]'));

    // Strategy 1: Find the Leave Call button in the center bar and grab the 3-dots button right next to it
    const leaveBtn = buttons.find((b) => {
      if (b.closest('#meet-lite-hud-host')) return false;
      const label = ((b.getAttribute('aria-label') || '') + ' ' + (b.getAttribute('data-tooltip') || '')).toLowerCase();
      const text = (b.textContent || '').trim().toLowerCase();
      return (label.includes('leave call') || label.includes('end call') || text.includes('call_end')) && !label.includes('gemini');
    });

    if (leaveBtn) {
      const barContainer = leaveBtn.closest('[role="region"], div[data-unhovered-action], div[jscontroller], div') || leaveBtn.parentElement;
      if (barContainer) {
        const siblingButtons = Array.from(barContainer.querySelectorAll('button, [role="button"]')).filter((b) => {
          if (b === leaveBtn || b.closest('#meet-lite-hud-host')) return false;
          const label = ((b.getAttribute('aria-label') || '') + ' ' + (b.getAttribute('data-tooltip') || '')).toLowerCase();
          const text = (b.textContent || '').trim().toLowerCase();
          if (label.includes('gemini') || text.includes('gemini')) return false;
          return label.includes('more options') || label.includes('more actions') || text === 'more_vert' || text.includes('more_vert') || label.includes('further options');
        });
        if (siblingButtons.length > 0) {
          return siblingButtons[siblingButtons.length - 1];
        }
      }
    }

    // Strategy 2: Viewport center-dock search (center 25% - 85% horizontal, bottom 150px)
    const centerButtons = buttons.filter((b) => {
      if (b.closest('#meet-lite-hud-host')) return false;
      const rect = b.getBoundingClientRect();
      if (rect.top < window.innerHeight - 150) return false;
      if (rect.left < window.innerWidth * 0.25 || rect.right > window.innerWidth * 0.85) return false; // Strictly in center dock!
      if (rect.width === 0 || rect.height === 0) return false;

      const label = ((b.getAttribute('aria-label') || '') + ' ' + (b.getAttribute('data-tooltip') || '')).toLowerCase();
      const text = (b.textContent || '').trim().toLowerCase();

      // Reject Gemini, participant cards, and leave button
      if (label.includes('gemini') || text.includes('gemini')) return false;
      if (/for\s|de\s/i.test(label)) return false;
      if (label.includes('leave') || label.includes('end call') || text.includes('call_end')) return false;

      return label.includes('more options') || label.includes('more actions') || text === 'more_vert' || text.includes('more_vert') || label.includes('further options') || label.includes('más opciones');
    });

    if (centerButtons.length > 0) {
      return centerButtons[0];
    }

    return null;
  }

  function findSettingsMenuItem() {
    const items = Array.from(document.querySelectorAll('[role="menuitem"], [role="menu"] [jsaction], [role="menu"] li, [role="menu"] div[tabindex]'));
    return items.find((item) => {
      if (item.closest('#meet-lite-hud-host')) return false;
      const text = (item.textContent || '').toLowerCase();
      const label = (item.getAttribute('aria-label') || '').toLowerCase();
      // Reject any Ask Gemini menu items
      if (text.includes('gemini') || label.includes('gemini')) return false;
      return text.includes('settings') ||
             label.includes('settings') ||
             text.includes('setting') ||
             label.includes('configuración') ||
             text.includes('paramètres') ||
             text.includes('einstellungen');
    });
  }

  function findVideoTab(dialog) {
    const elements = Array.from(dialog.querySelectorAll('[role="tab"], button, [role="button"], li, div[tabindex]'));
    return elements.find((el) => {
      const text = (el.textContent || '').toLowerCase();
      const label = (el.getAttribute('aria-label') || '').toLowerCase();
      return (text.includes('video') || label.includes('video') || text.includes('vídeo') || text.includes('videocam')) && !text.includes('audio');
    });
  }

  function findReceiveResolutionDropdown(dialog) {
    // 1. Text search for "Receive resolution" label
    const allNodes = Array.from(dialog.querySelectorAll('div, label, span, p, h2, h3'));
    for (const node of allNodes) {
      const directText = (node.innerText || node.textContent || '').trim().toLowerCase();
      if (directText.includes('receive resolution') || directText.includes('recepci') || directText.includes('réception')) {
        const container = node.closest('[jsaction], div, section') || node.parentElement;
        if (container) {
          const dd = container.querySelector('[role="listbox"], [role="combobox"], [aria-haspopup="listbox"], [aria-haspopup="true"], [data-value], div[jsaction*="click"], button');
          if (dd) return dd;
        }
        let sib = node.nextElementSibling;
        while (sib) {
          const dd = (sib.matches && sib.matches('[role="listbox"], [role="combobox"], [aria-haspopup]'))
            ? sib
            : sib.querySelector('[role="listbox"], [role="combobox"], [aria-haspopup], button');
          if (dd) return dd;
          sib = sib.nextElementSibling;
        }
      }
    }

    // 2. Look for dropdown listboxes inside the right panel of the dialog
    const listboxes = Array.from(dialog.querySelectorAll('[role="listbox"], [role="combobox"], [aria-haspopup="listbox"], [aria-haspopup="true"]'));
    if (listboxes.length >= 3) {
      return listboxes[listboxes.length - 1]; // In Google Meet Video panel: the last dropdown is Receive resolution
    } else if (listboxes.length === 2) {
      return listboxes[1];
    }

    // 3. Fallback search by resolution tags
    const triggers = Array.from(dialog.querySelectorAll('[role="listbox"], [role="combobox"], [aria-haspopup], [jsaction*="click"], [role="button"], button'));
    const resTriggers = triggers.filter((t) => {
      const text = (t.textContent || '').toLowerCase();
      return text.includes('720p') || text.includes('360p') || text.includes('auto') || text.includes('definition');
    });
    if (resTriggers.length >= 2) {
      return resTriggers[resTriggers.length - 1];
    } else if (resTriggers.length === 1) {
      return resTriggers[0];
    }

    return null;
  }

  function findResolutionOption(targetMode) {
    const options = Array.from(document.querySelectorAll('[role="option"], [role="menuitem"], li[data-value], div[data-value], [role="menu"] div[tabindex]'));
    if (options.length === 0) return null;

    if (targetMode === '360p' || targetMode === 'low' || targetMode === 'balanced' || targetMode === '360p_single') {
      // Priority 1: "Standard definition (360p), one video at a time"
      const singleVideoOpt = options.find((o) => {
        const text = (o.textContent || '').toLowerCase();
        return text.includes('360p') && (text.includes('one video') || text.includes('single') || text.includes('un vídeo') || text.includes('1 video'));
      });
      if (singleVideoOpt) return singleVideoOpt;

      // Priority 2: "Standard definition (360p)"
      const stdOpt = options.find((o) => {
        const text = (o.textContent || '').toLowerCase();
        return text.includes('360p') || text.includes('standard definition');
      });
      if (stdOpt) return stdOpt;
    } else if (targetMode === 'audio_only' || targetMode === 'ultra') {
      const audioOpt = options.find((o) => {
        const text = (o.textContent || '').toLowerCase();
        return text.includes('audio only') || text.includes('solo audio') || (text.includes('audio') && !text.includes('video'));
      });
      if (audioOpt) return audioOpt;
    } else if (targetMode === '720p' || targetMode === 'hd' || targetMode === 'normal') {
      const hdOpt = options.find((o) => {
        const text = (o.textContent || '').toLowerCase();
        return text.includes('720p') || text.includes('high definition') || text.includes('auto');
      });
      if (hdOpt) return hdOpt;
    }

    return null;
  }

  function closeSettingsDialog(dialog) {
    // 1. Dispatch Escape
    ['keydown', 'keyup'].forEach((evtType) => {
      document.dispatchEvent(new KeyboardEvent(evtType, {
        key: 'Escape',
        code: 'Escape',
        keyCode: 27,
        which: 27,
        bubbles: true,
        cancelable: true
      }));
    });

    // 2. Find and click Close button
    setTimeout(() => {
      const activeDialog = document.querySelector('[role="dialog"]');
      if (activeDialog) {
        const closeBtn = activeDialog.querySelector('button[aria-label*="Close" i], button[aria-label*="Dismiss" i], button[aria-label*="Done" i], button[jsname*="close" i]');
        if (closeBtn) simulateClick(closeBtn);
      }
    }, 80);
  }

  async function autoCapGoogleMeetServer(targetMode = '360p', shadow = null) {
    if (isCappingServer) return;
    isCappingServer = true;

    ensureSilentConfigStyle();

    const statusEl = shadow ? shadow.querySelector('#ml-server-cap-status') : null;
    const btn360 = shadow ? shadow.querySelector('#ml-btn-cap-360p') : null;
    const btnAudio = shadow ? shadow.querySelector('#ml-btn-cap-audio') : null;

    if (statusEl) {
      statusEl.textContent = '⏳ Auto-capping Google cloud server...';
    }

    document.body.classList.add('ml-silent-config');

    try {
      // Step 0: Dismiss any stray open menus (e.g. if Gemini menu was left open)
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }));
      await sleep(120);

      // Step 1: Check if Settings dialog is already open
      let dialog = document.querySelector('[role="dialog"]');

      if (!dialog) {
        // Find center control bar's More Options button (adjacent to Leave call)
        let moreBtn = findCenterBarMoreOptionsButton();
        if (!moreBtn) {
          // If inactive, Google Meet hides the bottom bar. Wake it up with a synthetic mousemove
          document.dispatchEvent(new MouseEvent('mousemove', { clientX: window.innerWidth / 2, clientY: window.innerHeight - 20, bubbles: true }));
          await sleep(300);
          moreBtn = findCenterBarMoreOptionsButton();
        }

        if (!moreBtn) {
          if (statusEl) statusEl.textContent = '💡 Please hover over the bottom bar';
          return;
        }

        simulateClick(moreBtn);

        // Step 2: Wait for Menu to mount and find Settings item
        const settingsItem = await waitFor(() => findSettingsMenuItem(), 3500);
        if (!settingsItem) {
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
          if (statusEl) statusEl.textContent = '💡 Retrying... please click again';
          return;
        }

        simulateClick(settingsItem);

        // Step 3: Wait for Settings Dialog
        dialog = await waitFor(() => document.querySelector('[role="dialog"]'), 3500);
      }

      if (!dialog) {
        if (statusEl) statusEl.textContent = '💡 Retrying... please click again';
        return;
      }

      // Step 4: Find and click Video Tab
      const videoTab = await waitFor(() => findVideoTab(dialog), 2500);
      if (videoTab) {
        simulateClick(videoTab);
        await sleep(300);
      }

      // Step 5: Find Receive resolution dropdown
      const dd = await waitFor(() => findReceiveResolutionDropdown(dialog), 3000);
      if (!dd) {
        closeSettingsDialog(dialog);
        if (statusEl) statusEl.textContent = '💡 Retrying... please click again';
        return;
      }

      simulateClick(dd);

      // Step 6: Wait for Resolution Option to appear and click it
      const opt = await waitFor(() => findResolutionOption(targetMode), 2500);
      if (opt) {
        simulateClick(opt);
        await sleep(150);
      }

      // Step 7: Close dialog
      closeSettingsDialog(dialog);
      await sleep(120);

      // Step 8: Success feedback
      const label = targetMode === 'audio_only' ? 'Audio Only (0 video)' : '360p Single Video';
      if (statusEl) {
        statusEl.textContent = `✅ Cloud Server Capped to ${label}!`;
      }
      if (btn360 && btnAudio) {
        if (targetMode === 'audio_only') {
          btnAudio.classList.add('active');
          btn360.classList.remove('active');
        } else {
          btn360.classList.add('active');
          btnAudio.classList.remove('active');
        }
      }
    } catch (err) {
      console.warn('[MeetLite] autoCapGoogleMeetServer error:', err);
      if (statusEl) {
        statusEl.textContent = '💡 Auto-cap interrupted, please click again';
      }
    } finally {
      document.body.classList.remove('ml-silent-config');
      isCappingServer = false;
    }
  }

  function setupEvents(shadow, host, card) {
    const closeBtn = shadow.querySelector('#ml-btn-close');
    const minBtn = shadow.querySelector('#ml-btn-minimize');
    const pill = shadow.querySelector('#meet-lite-hud-pill');
    const dragHeader = shadow.querySelector('#ml-drag-header');
    const chkMaster = shadow.querySelector('#ml-chk-master');
    const masterStatusText = shadow.querySelector('#ml-master-status-text');
    const resizeGrip = shadow.querySelector('#ml-resize-grip');

    // Master Switch Toggle (Enable / Disable)
    chkMaster.addEventListener('change', () => {
      currentConfig.enabled = chkMaster.checked;
      const pillDot = shadow.querySelector('.ml-pill-dot');
      const pillStat = shadow.querySelector('#ml-pill-stat');
      if (currentConfig.enabled) {
        card.classList.remove('disabled-mode');
        masterStatusText.textContent = 'ACTIVE';
        masterStatusText.classList.remove('off');
        if (pillDot) pillDot.classList.remove('disabled');
        if (pillStat) pillStat.textContent = `${currentStats.totalKbps || 0} Kbps`;
      } else {
        card.classList.add('disabled-mode');
        masterStatusText.textContent = 'OFF';
        masterStatusText.classList.add('off');
        if (pillDot) pillDot.classList.add('disabled');
        if (pillStat) pillStat.textContent = 'OFF';
      }
      saveConfig();
    });

    // Minimize to capsule pill
    if (minBtn && pill) {
      minBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        card.style.display = 'none';
        pill.style.display = 'flex';
        currentConfig.isMinimized = true;
        saveConfig();
      });

      // Click pill to restore full HUD card (unless user was dragging)
      pill.addEventListener('click', (e) => {
        if (pill.dataset.dragged === 'true') {
          return;
        }
        pill.style.display = 'none';
        card.style.display = 'flex';
        currentConfig.isMinimized = false;
        saveConfig();
      });
    }

    // Close (completely hide HUD from screen)
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
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

    // Dragging (supports both Card Header and Capsule Pill)
    let isDragging = false;
    let startX = 0, startY = 0, origX = 0, origY = 0;
    let hasMoved = false;

    function bindDrag(handle, isPillHandle) {
      if (!handle) return;
      handle.addEventListener('mousedown', (e) => {
        if (e.target.closest('button, label, input')) return;
        isDragging = true;
        hasMoved = false;
        startX = e.clientX;
        startY = e.clientY;
        const rect = host.getBoundingClientRect();
        origX = rect.left;
        origY = rect.top;

        const onMouseMove = (ev) => {
          if (!isDragging) return;
          const dx = ev.clientX - startX;
          const dy = ev.clientY - startY;

          if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
            hasMoved = true;
            if (isPillHandle && pill) {
              pill.dataset.dragged = 'true';
            }
          }

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

          if (isPillHandle && pill && hasMoved) {
            setTimeout(() => {
              if (pill) delete pill.dataset.dragged;
            }, 50);
          }
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
      });
    }

    bindDrag(dragHeader, false);
    bindDrag(pill, true);

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

    bindButtonGroup(shadow, '#ml-grp-screenshare', (val) => {
      currentConfig.screenShareQuality = val;
      const tag = shadow.querySelector('#ml-tag-screenshare');
      if (tag) {
        if (val === 'freeze') tag.textContent = '❄️ Frozen';
        else if (val === 'saver') tag.textContent = 'Saves 60%';
        else if (val === 'off') tag.textContent = 'Disabled';
        else tag.textContent = 'Full HD';
      }
      saveConfig();
    });

    bindButtonGroup(shadow, '#ml-grp-my-screenshare', (val) => {
      currentConfig.myScreenShareQuality = val;
      const tag = shadow.querySelector('#ml-tag-my-screenshare');
      if (tag) {
        if (val === 'hd') tag.textContent = 'Full 1080p';
        else if (val === '720p') tag.textContent = 'Balanced • Saves 60%';
        else if (val === 'low') tag.textContent = 'Low • Saves 90%';
        else tag.textContent = 'Sharp Text • Saves 80%';
      }
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

    // Bandwidth Graph Visibility Toggle
    const chkGraph = shadow.querySelector('#ml-chk-graph');
    const graphWrap = shadow.querySelector('#ml-mini-graph-wrap');
    if (chkGraph && graphWrap) {
      chkGraph.addEventListener('change', () => {
        currentConfig.showGraph = chkGraph.checked;
        graphWrap.style.display = currentConfig.showGraph ? 'block' : 'none';
        saveConfig();
      });
    }

    // Google Server Cap Buttons
    const btnCap360 = shadow.querySelector('#ml-btn-cap-360p');
    const btnCapAudio = shadow.querySelector('#ml-btn-cap-audio');

    if (btnCap360) {
      btnCap360.addEventListener('click', () => {
        autoCapGoogleMeetServer('360p', shadow);
      });
    }

    if (btnCapAudio) {
      btnCapAudio.addEventListener('click', () => {
        autoCapGoogleMeetServer('audio_only', shadow);
      });
    }
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
      currentConfig.screenShareQuality = 'freeze';
      currentConfig.myScreenShareQuality = 'low';
      currentConfig.audioSaver = true;
      currentConfig.freezeInactiveTab = true;
      autoCapGoogleMeetServer('audio_only', shadow);
    } else if (preset === 'low') {
      currentConfig.outgoingVideoQuality = '180p';
      currentConfig.outgoingMaxFps = 10;
      currentConfig.outgoingVideoMaxKbps = 120;
      currentConfig.incomingVideoMode = 'audio_only';
      currentConfig.screenShareQuality = 'saver';
      currentConfig.myScreenShareQuality = 'text';
      currentConfig.audioSaver = true;
      currentConfig.freezeInactiveTab = true;
      autoCapGoogleMeetServer('360p_single', shadow);
    } else if (preset === 'balanced') {
      currentConfig.outgoingVideoQuality = '360p';
      currentConfig.outgoingMaxFps = 15;
      currentConfig.outgoingVideoMaxKbps = 400;
      currentConfig.incomingVideoMode = 'low';
      currentConfig.screenShareQuality = 'saver';
      currentConfig.myScreenShareQuality = '720p';
      currentConfig.audioSaver = false;
      currentConfig.freezeInactiveTab = true;
      autoCapGoogleMeetServer('360p', shadow);
    }

    updatePresetUI(shadow, preset);
    syncActive(shadow, '#ml-grp-video', currentConfig.outgoingVideoQuality);
    syncActive(shadow, '#ml-grp-fps', currentConfig.outgoingMaxFps.toString());
    syncActive(shadow, '#ml-grp-remote', currentConfig.incomingVideoMode);
    syncActive(shadow, '#ml-grp-screenshare', currentConfig.screenShareQuality || 'saver');
    syncActive(shadow, '#ml-grp-my-screenshare', currentConfig.myScreenShareQuality || 'text');

    const ssTag = shadow.querySelector('#ml-tag-screenshare');
    if (ssTag) {
      const q = currentConfig.screenShareQuality || 'saver';
      if (q === 'freeze') ssTag.textContent = '❄️ Frozen';
      else if (q === 'saver') ssTag.textContent = 'Saves 60%';
      else if (q === 'off') ssTag.textContent = 'Disabled';
      else ssTag.textContent = 'Full HD';
    }

    const mySsTag = shadow.querySelector('#ml-tag-my-screenshare');
    if (mySsTag) {
      const q = currentConfig.myScreenShareQuality || 'text';
      if (q === 'hd') mySsTag.textContent = 'Full 1080p';
      else if (q === '720p') mySsTag.textContent = 'Balanced • Saves 60%';
      else if (q === 'low') mySsTag.textContent = 'Low • Saves 90%';
      else mySsTag.textContent = 'Sharp Text • Saves 80%';
    }

    const chkAudio = shadow.querySelector('#ml-chk-audio');
    if (chkAudio) chkAudio.checked = currentConfig.audioSaver;
    const chkFreeze = shadow.querySelector('#ml-chk-freeze');
    if (chkFreeze) chkFreeze.checked = currentConfig.freezeInactiveTab;

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

  const hudHistory = [];

  function renderHUDChart(shadow) {
    if (currentConfig.showGraph === false) return;
    const canvas = shadow.querySelector('#ml-mini-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const maxScale = 3600; // Kbps ceiling
    const MAX_PTS = 60; // 60 seconds rolling view

    // Subtle horizontal grid line at 1000k
    ctx.strokeStyle = '#f1f5f9';
    ctx.lineWidth = 1;
    const midY = h - (1000 / maxScale) * (h - 4);
    ctx.beginPath();
    ctx.moveTo(0, midY);
    ctx.lineTo(w, midY);
    ctx.stroke();

    // Red dashed baseline line at 3,200 Kbps (Standard Meet)
    const baseY = Math.max(3, h - (3200 / maxScale) * (h - 2));
    ctx.save();
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, baseY);
    ctx.lineTo(w, baseY);
    ctx.stroke();
    ctx.restore();

    // Subtle scale markers
    ctx.font = '7.5px -apple-system, sans-serif';
    ctx.fillStyle = '#ef4444';
    ctx.textAlign = 'right';
    ctx.fillText('3.2M', w - 3, Math.max(8, baseY - 2));

    ctx.fillStyle = '#94a3b8';
    ctx.fillText('1M', w - 3, midY - 2);

    if (hudHistory.length === 0) return;

    const pts = hudHistory.length === 1 ? [hudHistory[0], hudHistory[0]] : hudHistory;
    const stepX = w / (MAX_PTS - 1);

    // Download Area (Green)
    ctx.beginPath();
    pts.forEach((pt, i) => {
      const x = (MAX_PTS - pts.length + i) * stepX;
      const y = h - (Math.min(maxScale, pt.recv) / maxScale) * (h - 4);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.lineTo(w, h);
    ctx.lineTo((MAX_PTS - pts.length) * stepX, h);
    ctx.closePath();
    ctx.fillStyle = 'rgba(16, 185, 129, 0.16)';
    ctx.fill();

    // Download Stroke (Green)
    ctx.beginPath();
    pts.forEach((pt, i) => {
      const x = (MAX_PTS - pts.length + i) * stepX;
      const y = h - (Math.min(maxScale, pt.recv) / maxScale) * (h - 4);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 1.8;
    ctx.stroke();

    // Upload Stroke (Blue)
    ctx.beginPath();
    pts.forEach((pt, i) => {
      const x = (MAX_PTS - pts.length + i) * stepX;
      const y = h - (Math.min(maxScale, pt.sent) / maxScale) * (h - 4);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Current Head Indicator Dot
    const lastPt = pts[pts.length - 1];
    const lastX = w - 1;
    const lastRecvY = h - (Math.min(maxScale, lastPt.recv) / maxScale) * (h - 4);
    ctx.fillStyle = '#10b981';
    ctx.beginPath();
    ctx.arc(lastX, lastRecvY, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Live Telemetry Receiver with context invalidation protection
  window.addEventListener('message', (event) => {
    if (!event.data || event.data.type !== 'MEET_LITE_STATS') return;
    currentStats = event.data.data;

    const host = document.getElementById('meet-lite-hud-host');
    if (!host || !host.shadowRoot) return;
    const shadow = host.shadowRoot;

    const sentEl = shadow.querySelector('#ml-val-sent');
    const recvEl = shadow.querySelector('#ml-val-recv');
    const savedEl = shadow.querySelector('#ml-val-saved');
    const pillStat = shadow.querySelector('#ml-pill-stat');

    if (sentEl) sentEl.textContent = `${currentStats.sentKbps} Kbps`;
    if (recvEl) recvEl.textContent = `${currentStats.recvKbps} Kbps`;
    if (savedEl) savedEl.textContent = `~${currentStats.savedMB || 0} MB`;
    if (pillStat) {
      pillStat.textContent = currentConfig.enabled === false ? 'OFF' : `${currentStats.totalKbps} Kbps`;
    }

    // Update Live 60s HUD mini sparkline
    hudHistory.push({ sent: currentStats.sentKbps, recv: currentStats.recvKbps });
    if (hudHistory.length > 60) hudHistory.shift();
    renderHUDChart(shadow);

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
        } else if (req.type === 'MEET_LITE_SET_CONFIG') {
          if (req.config) {
            currentConfig = { ...currentConfig, ...req.config };
            const host = document.getElementById('meet-lite-hud-host');
            const shadow = host ? host.shadowRoot : null;
            if (shadow) {
              const card = shadow.querySelector('#meet-lite-hud-card');
              const chkMaster = shadow.querySelector('#ml-chk-master');
              const masterStatusText = shadow.querySelector('#ml-master-status-text');
              const pillDot = shadow.querySelector('.ml-pill-dot');
              if (chkMaster) chkMaster.checked = currentConfig.enabled !== false;
              const chkGraph = shadow.querySelector('#ml-chk-graph');
              const graphWrap = shadow.querySelector('#ml-mini-graph-wrap');
              if (chkGraph) chkGraph.checked = currentConfig.showGraph !== false;
              if (graphWrap) graphWrap.style.display = currentConfig.showGraph !== false ? 'block' : 'none';
              const pillEl = shadow.querySelector('#meet-lite-hud-pill');
              if (card && pillEl) {
                if (currentConfig.isMinimized) {
                  card.style.display = 'none';
                  pillEl.style.display = 'flex';
                } else {
                  card.style.display = 'flex';
                  pillEl.style.display = 'none';
                }
              }
              if (card) {
                if (currentConfig.enabled === false) {
                  card.classList.add('disabled-mode');
                  if (masterStatusText) {
                    masterStatusText.textContent = 'OFF';
                    masterStatusText.classList.add('off');
                  }
                  if (pillDot) pillDot.classList.add('disabled');
                } else {
                  card.classList.remove('disabled-mode');
                  if (masterStatusText) {
                    masterStatusText.textContent = 'ACTIVE';
                    masterStatusText.classList.remove('off');
                  }
                  if (pillDot) pillDot.classList.remove('disabled');
                }
              }
              if (currentConfig.preset) {
                applyPreset(currentConfig.preset, shadow);
              }
            }
            syncConfigToPageHook();
          }
          sendResponse({ ok: true });
        }
      });
    } catch (e) {}
  }

  // Google Meet SPA auto-remount safeguard
  setInterval(() => {
    if (document.body && !document.getElementById('meet-lite-hud-host')) {
      if (currentConfig.hudVisible !== false) {
        if (isExtensionValid() && chrome.storage && chrome.storage.sync) {
          chrome.storage.sync.get(['meetLitePos', 'meetLiteSize'], (res) => {
            initHUD(res ? res.meetLitePos : null, res ? res.meetLiteSize : null);
          });
        } else {
          initHUD();
        }
      }
    }
  }, 2500);

  console.log('[MeetLite] HUD Injector active.');
})();
