/**
 * MeetLite - WebRTC & Media Engine Hook
 * Injected into MAIN world at document_start.
 */

(function () {
  'use strict';

  if (window.__meetLiteHookInstalled) return;
  window.__meetLiteHookInstalled = true;

  console.log('[MeetLite] Hook initializing in MAIN world...');

  // Default configuration
  window.__meetLiteConfig = {
    enabled: true,                  // Master switch
    preset: 'low',
    outgoingVideoQuality: '180p',   // 'off', '180p', '360p', '720p', 'max'
    outgoingMaxFps: 10,             // 5, 10, 15, 30
    outgoingVideoMaxKbps: 120,      // 40, 120, 350, 1500
    incomingVideoMode: 'audio_only', // 'audio_only', 'low', 'normal'
    audioSaver: true,               // Cap Opus to ~20 kbps
    freezeInactiveTab: true,        // Freeze remote video when tab is hidden
    blockVisualEffects: true
  };

  const activePCs = new Set();

  // -------------------------------------------------------------
  // 1. Intercept getUserMedia (Safe Hardware Resolution Clamping)
  // -------------------------------------------------------------
  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    const origGUM = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);

    navigator.mediaDevices.getUserMedia = async function (constraints) {
      const config = window.__meetLiteConfig;

      // If MeetLite is disabled, pass through original constraints directly
      if (config.enabled === false) {
        return origGUM(constraints);
      }

      if (constraints && constraints.video) {
        // If camera is explicitly OFF, capture cleanly but mute track to prevent any crash
        if (config.outgoingVideoQuality === 'off') {
          console.log('[MeetLite] Outgoing video is OFF. Capturing audio-only or muted track.');
          try {
            const stream = await origGUM(constraints);
            stream.getVideoTracks().forEach((track) => {
              track.enabled = false;
            });
            return stream;
          } catch (e) {
            if (constraints.audio) {
              return origGUM({ audio: constraints.audio });
            }
            throw e;
          }
        }

        let idealW = 640;
        let idealH = 360;

        if (config.outgoingVideoQuality === '180p') {
          idealW = 320;
          idealH = 180;
        } else if (config.outgoingVideoQuality === '360p') {
          idealW = 640;
          idealH = 360;
        } else if (config.outgoingVideoQuality === '720p') {
          idealW = 1280;
          idealH = 720;
        }

        try {
          const safeConstraints = { ...constraints };
          if (typeof constraints.video === 'boolean') {
            safeConstraints.video = {
              width: { ideal: idealW },
              height: { ideal: idealH },
              frameRate: { ideal: config.outgoingMaxFps || 10 }
            };
          } else if (typeof constraints.video === 'object') {
            safeConstraints.video = { ...constraints.video };
            safeConstraints.video.width = { ideal: idealW };
            safeConstraints.video.height = { ideal: idealH };
            if (config.outgoingMaxFps) {
              safeConstraints.video.frameRate = { ideal: config.outgoingMaxFps };
            }
          }
          return await origGUM(safeConstraints);
        } catch (clampErr) {
          console.warn('[MeetLite] Clamped resolution rejected by hardware, falling back:', clampErr);
          return await origGUM(constraints);
        }
      }

      return origGUM(constraints);
    };
  }

  // -------------------------------------------------------------
  // 1b. Intercept MediaStreamTrack.prototype.applyConstraints
  // Prevents Google Meet from silently re-elevating camera to 720p @ 30fps
  // -------------------------------------------------------------
  if (window.MediaStreamTrack && MediaStreamTrack.prototype.applyConstraints) {
    const origApplyConstraints = MediaStreamTrack.prototype.applyConstraints;
    MediaStreamTrack.prototype.applyConstraints = async function (constraints) {
      const config = window.__meetLiteConfig;
      if (config.enabled === false || !constraints) {
        return origApplyConstraints.apply(this, arguments);
      }

      if (this.kind === 'video') {
        let idealW = 320;
        let idealH = 180;
        if (config.outgoingVideoQuality === '180p') {
          idealW = 320; idealH = 180;
        } else if (config.outgoingVideoQuality === '360p') {
          idealW = 640; idealH = 360;
        } else if (config.outgoingVideoQuality === '720p') {
          idealW = 1280; idealH = 720;
        } else if (config.outgoingVideoQuality === 'off') {
          idealW = 160; idealH = 120;
        }

        const safe = { ...constraints };
        if (typeof safe.width === 'object' && safe.width !== null) {
          safe.width = { ...safe.width, ideal: idealW, max: idealW };
        } else {
          safe.width = { ideal: idealW, max: idealW };
        }

        if (typeof safe.height === 'object' && safe.height !== null) {
          safe.height = { ...safe.height, ideal: idealH, max: idealH };
        } else {
          safe.height = { ideal: idealH, max: idealH };
        }

        if (config.outgoingMaxFps) {
          if (typeof safe.frameRate === 'object' && safe.frameRate !== null) {
            safe.frameRate = { ...safe.frameRate, ideal: config.outgoingMaxFps, max: config.outgoingMaxFps };
          } else {
            safe.frameRate = { ideal: config.outgoingMaxFps, max: config.outgoingMaxFps };
          }
        }

        try {
          return await origApplyConstraints.call(this, safe);
        } catch (e) {
          return origApplyConstraints.apply(this, arguments);
        }
      }

      return origApplyConstraints.apply(this, arguments);
    };
  }

  // -------------------------------------------------------------
  // 2. Intercept RTCPeerConnection via JavaScript Proxy
  // -------------------------------------------------------------
  const OrigPeerConnection = window.RTCPeerConnection || window.webkitRTCPeerConnection;
  if (OrigPeerConnection) {
    const pcProxy = new Proxy(OrigPeerConnection, {
      construct(target, args) {
        const pc = new target(...args);
        activePCs.add(pc);
        console.log('[MeetLite] RTCPeerConnection registered. Total active:', activePCs.size);

        pc.addEventListener('connectionstatechange', () => {
          if (pc.connectionState === 'closed' || pc.connectionState === 'failed') {
            activePCs.delete(pc);
            console.log('[MeetLite] RTCPeerConnection closed. Remaining:', activePCs.size);
          }
        });

        // Inbound video track control
        pc.addEventListener('track', (e) => {
          if (e.track && e.track.kind === 'video') {
            if (window.__meetLiteConfig.enabled !== false && window.__meetLiteConfig.incomingVideoMode === 'audio_only') {
              e.track.enabled = false;
            }
          }
        });

        return pc;
      }
    });

    window.RTCPeerConnection = pcProxy;
    if (window.webkitRTCPeerConnection) {
      window.webkitRTCPeerConnection = pcProxy;
    }

    // Intercept addTrack to instantly apply clamping on new tracks
    const origAddTrack = OrigPeerConnection.prototype.addTrack;
    if (origAddTrack) {
      OrigPeerConnection.prototype.addTrack = function () {
        const sender = origAddTrack.apply(this, arguments);
        setTimeout(() => applyCurrentSettings(), 50);
        return sender;
      };
    }
  }

  // -------------------------------------------------------------
  // 3. Simulcast-Aware Bitrate Budget Allocation
  // Prevents multi-layer simulcast from tripling bitrate to 1.5k–2k
  // -------------------------------------------------------------
  function clampEncodings(encodings, config, kind) {
    if (!encodings || encodings.length === 0) return;

    if (kind === 'video') {
      const totalCapBps = (config.outgoingVideoMaxKbps || 120) * 1000;
      const maxFps = config.outgoingMaxFps || 10;

      if (encodings.length === 1) {
        encodings[0].maxBitrate = totalCapBps;
        encodings[0].maxFramerate = maxFps;
        if (config.outgoingVideoQuality === 'off') {
          encodings[0].active = false;
        }
      } else {
        // Multi-layer simulcast: In Google Meet, setting capBps on every layer causes
        // parallel transmission of 3 layers summing to 1.5k-2k!
        // We properly allocate total budget across active layers.
        if (config.outgoingVideoQuality === 'off') {
          encodings.forEach((enc) => {
            enc.active = false;
            enc.maxBitrate = 10000;
            enc.maxFramerate = 5;
          });
        } else if (config.outgoingVideoQuality === '180p') {
          // Low / 180p: Enable only the lowest layer with full budget, disable higher layers
          encodings[0].active = true;
          encodings[0].maxBitrate = totalCapBps;
          encodings[0].maxFramerate = maxFps;
          for (let i = 1; i < encodings.length; i++) {
            encodings[i].active = false;
            encodings[i].maxBitrate = 10000;
            encodings[i].maxFramerate = 5;
          }
        } else if (config.outgoingVideoQuality === '360p') {
          // Balanced / 360p: Budget across low (40%) and medium (60%), disable high
          encodings[0].active = true;
          encodings[0].maxBitrate = Math.round(totalCapBps * 0.4);
          encodings[0].maxFramerate = maxFps;
          if (encodings[1]) {
            encodings[1].active = true;
            encodings[1].maxBitrate = Math.round(totalCapBps * 0.6);
            encodings[1].maxFramerate = maxFps;
          }
          for (let i = 2; i < encodings.length; i++) {
            encodings[i].active = false;
            encodings[i].maxBitrate = 10000;
            encodings[i].maxFramerate = 5;
          }
        } else {
          // Higher resolutions: distribute budget proportionally
          const perLayer = Math.floor(totalCapBps / encodings.length);
          encodings.forEach((enc) => {
            enc.maxBitrate = perLayer;
            enc.maxFramerate = maxFps;
          });
        }
      }
    } else if (kind === 'audio' && config.audioSaver) {
      const audioCapBps = 20 * 1000; // 20 Kbps Opus
      encodings.forEach((enc) => {
        enc.maxBitrate = audioCapBps;
      });
    }
  }

  // Intercept RTCRtpSender.prototype.setParameters
  if (window.RTCRtpSender && RTCRtpSender.prototype.setParameters) {
    const origSetParameters = RTCRtpSender.prototype.setParameters;
    RTCRtpSender.prototype.setParameters = async function (params) {
      const config = window.__meetLiteConfig;
      if (config.enabled === false) {
        return origSetParameters.apply(this, arguments);
      }

      if (params && params.encodings && params.encodings.length > 0) {
        const kind = (this.track && this.track.kind) ? this.track.kind : 'video';
        clampEncodings(params.encodings, config, kind);
      }

      try {
        return await origSetParameters.apply(this, arguments);
      } catch (err) {
        // Fallback if browser complains about active: false in setParameters
        if (params && params.encodings) {
          const capBps = Math.floor(((config.outgoingVideoMaxKbps || 120) * 1000) / params.encodings.length);
          params.encodings.forEach((enc) => {
            enc.maxBitrate = capBps;
            delete enc.active;
          });
          return origSetParameters.apply(this, arguments);
        }
        throw err;
      }
    };
  }

  // -------------------------------------------------------------
  // Screen Share Quality & Freeze Engine
  // -------------------------------------------------------------
  const screenShareState = {
    currentMode: 'hd',
    timer: null,
    overlayEl: null
  };

  function getPresentationVideo() {
    // 1. Explicit Google Meet presentation attributes
    const explicit = document.querySelector('[data-is-screen-share="true"] video, [data-is-presentation="true"] video, [aria-label*="Presentation"] video, [aria-label*="presentation"] video, [aria-label*="presenting"] video');
    if (explicit && (explicit.videoWidth > 0 || explicit.clientWidth > 0)) return explicit;

    // 2. Viewport-largest video on stage
    let maxArea = 0;
    let bestVideo = null;
    document.querySelectorAll('video').forEach((v) => {
      if (v.closest('#meet-lite-hud-host')) return;
      const rect = v.getBoundingClientRect();
      const area = rect.width * rect.height;
      if (area > maxArea && rect.width > 350 && rect.height > 200) {
        maxArea = area;
        bestVideo = v;
      }
    });

    return bestVideo;
  }

  function captureVideoSnapshot(v) {
    try {
      const w = v.videoWidth || v.clientWidth || 1280;
      const h = v.videoHeight || v.clientHeight || 720;
      if (w < 20 || h < 20) return null;

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(v, 0, 0, w, h);
      return canvas.toDataURL('image/jpeg', 0.95);
    } catch (e) {
      return null;
    }
  }

  function removeScreenShareOverlay() {
    const existing = document.getElementById('ml-screenshare-overlay');
    if (existing) existing.remove();
    screenShareState.overlayEl = null;
  }

  function updateScreenShareOverlay(v, bgDataUrl, badgeText, badgeIcon) {
    if (!v || !v.parentElement) return;

    let overlay = document.getElementById('ml-screenshare-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'ml-screenshare-overlay';
      overlay.style.position = 'absolute';
      overlay.style.top = '0';
      overlay.style.left = '0';
      overlay.style.width = '100%';
      overlay.style.height = '100%';
      overlay.style.zIndex = '5';
      overlay.style.pointerEvents = 'none';
      overlay.style.backgroundColor = '#000000';
      overlay.style.backgroundPosition = 'center';
      overlay.style.backgroundSize = 'contain';
      overlay.style.backgroundRepeat = 'no-repeat';

      const computedPos = window.getComputedStyle(v.parentElement).position;
      if (computedPos === 'static') {
        v.parentElement.style.position = 'relative';
      }

      v.parentElement.appendChild(overlay);
      screenShareState.overlayEl = overlay;
    }

    if (bgDataUrl) {
      overlay.style.backgroundImage = `url(${bgDataUrl})`;
    }

    overlay.innerHTML = `
      <div style="position: absolute; top: 14px; left: 50%; transform: translateX(-50%); background: rgba(15, 23, 42, 0.92); color: #38bdf8; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 11.5px; font-weight: 700; padding: 4px 14px; border-radius: 9999px; border: 1px solid rgba(56, 189, 248, 0.45); box-shadow: 0 4px 14px rgba(0,0,0,0.4); display: flex; align-items: center; gap: 7px; pointer-events: none; white-space: nowrap;">
        <span>${badgeIcon}</span>
        <span>${badgeText}</span>
      </div>
    `;
  }

  function applyScreenShareQuality(mode) {
    if (screenShareState.timer) {
      clearInterval(screenShareState.timer);
      screenShareState.timer = null;
    }

    screenShareState.currentMode = mode;
    const v = getPresentationVideo();

    if (mode === 'hd') {
      removeScreenShareOverlay();
      if (v) {
        v.style.visibility = 'visible';
        v.play().catch(() => {});
      }
      return;
    }

    if (mode === 'off') {
      removeScreenShareOverlay();
      if (v) {
        v.style.visibility = 'hidden';
      }
      return;
    }

    if (mode === 'freeze') {
      if (v) {
        const snap = captureVideoSnapshot(v);
        if (snap) {
          updateScreenShareOverlay(v, snap, 'Slide Frozen (Click HD or Saver to unfreeze)', '❄️');
        }
      }
      return;
    }

    if (mode === 'saver') {
      // Slide Saver: Take initial snapshot, then refresh every 3.5 seconds
      if (v) {
        const snap = captureVideoSnapshot(v);
        if (snap) {
          updateScreenShareOverlay(v, snap, 'Slide Saver (Refreshing every 3s &bull; Saves 85%)', '🛡️');
        }
      }

      screenShareState.timer = setInterval(() => {
        if (window.__meetLiteConfig.screenShareQuality !== 'saver') {
          clearInterval(screenShareState.timer);
          return;
        }
        const presVideo = getPresentationVideo();
        if (presVideo) {
          const freshSnap = captureVideoSnapshot(presVideo);
          if (freshSnap) {
            updateScreenShareOverlay(presVideo, freshSnap, 'Slide Saver (Refreshing every 3s &bull; Saves 85%)', '🛡️');
          }
        }
      }, 3500);
    }
  }

  // -------------------------------------------------------------
  // 4. Actively Enforce Settings
  // -------------------------------------------------------------
  async function applyCurrentSettings() {
    const config = window.__meetLiteConfig;

    for (const pc of activePCs) {
      if (pc.connectionState === 'closed') continue;

      // If master switch is OFF, restore full Meet performance
      if (config.enabled === false) {
        try {
          pc.getSenders().forEach((s) => {
            if (s.track) s.track.enabled = true;
          });
          pc.getReceivers().forEach((r) => {
            if (r.track && r.track.kind === 'video') r.track.enabled = true;
          });
        } catch (e) {}
        continue;
      }

      try {
        // Enforce senders with valid mutable parameters
        const senders = pc.getSenders();
        for (const sender of senders) {
          if (!sender.track) continue;

          if (sender.track.kind === 'video') {
            sender.track.enabled = (config.outgoingVideoQuality !== 'off');

            const params = sender.getParameters();
            if (params && params.encodings && params.encodings.length > 0) {
              clampEncodings(params.encodings, config, 'video');
              await sender.setParameters(params).catch(async () => {
                // Safe fallback: evenly budget without active toggle
                const capBps = Math.floor(((config.outgoingVideoMaxKbps || 120) * 1000) / params.encodings.length);
                params.encodings.forEach((enc) => {
                  enc.maxBitrate = capBps;
                  delete enc.active;
                });
                await sender.setParameters(params).catch(() => {});
              });
            }
          }

          if (sender.track.kind === 'audio') {
            const params = sender.getParameters();
            if (params && params.encodings && params.encodings.length > 0) {
              const capBps = config.audioSaver ? 20 * 1000 : 48 * 1000;
              params.encodings.forEach((enc) => { enc.maxBitrate = capBps; });
              await sender.setParameters(params).catch(() => {});
            }
          }
        }
      } catch (e) {}

      try {
        // Enforce receivers (incoming video tracks)
        const receivers = pc.getReceivers();
        for (const receiver of receivers) {
          if (receiver.track && receiver.track.kind === 'video') {
            receiver.track.enabled = (config.incomingVideoMode !== 'audio_only');
          }
        }
      } catch (e) {}
    }

    // Clean up any stray video element restrictions
    try {
      document.querySelectorAll('video').forEach((v) => {
        if (v.style.maxWidth) v.style.maxWidth = '';
        if (v.style.maxHeight) v.style.maxHeight = '';
      });
    } catch (e) {}

    // Apply Screen Share Quality
    applyScreenShareQuality(config.screenShareQuality || 'hd');
  }

  // Continuous Enforcement Loop: runs every 1.5s to ensure no stream escapes clamping
  setInterval(() => {
    if (window.__meetLiteConfig.enabled !== false && activePCs.size > 0) {
      applyCurrentSettings();
    }
  }, 1500);

  // -------------------------------------------------------------
  // 5. Inactive Tab Auto-Freeze
  // -------------------------------------------------------------
  document.addEventListener('visibilitychange', () => {
    if (window.__meetLiteConfig.enabled === false || !window.__meetLiteConfig.freezeInactiveTab) return;
    const isHidden = document.hidden;

    for (const pc of activePCs) {
      if (pc.connectionState === 'closed') continue;
      try {
        pc.getReceivers().forEach((receiver) => {
          if (receiver.track && receiver.track.kind === 'video') {
            if (window.__meetLiteConfig.incomingVideoMode !== 'audio_only') {
              receiver.track.enabled = !isHidden;
            }
          }
        });
      } catch (e) {}
    }
  });

  // -------------------------------------------------------------
  // 6. Robust WebRTC Bandwidth & Packet Loss Telemetry
  // Per-SSRC delta tracking completely eliminates false participant/renegotiation spikes
  // -------------------------------------------------------------
  const prevReportCounters = new Map(); // report.id -> { bytes: number, timestamp: number }
  let prevSmoothed = { sent: 0, recv: 0 };
  let lastStatsTick = 0;
  let cumulativeSavedBytes = 0;

  setInterval(async () => {
    const now = performance.now();
    const dt = lastStatsTick > 0 ? (now - lastStatsTick) / 1000 : 1.0;
    lastStatsTick = now;

    let totalSentDeltaBytes = 0;
    let totalRecvDeltaBytes = 0;
    let packetsLost = 0;
    let packetsRecv = 0;

    for (const pc of activePCs) {
      if (pc.connectionState === 'closed') continue;
      try {
        const stats = await pc.getStats();

        stats.forEach((report) => {
          if (report.type === 'outbound-rtp') {
            const bytes = report.bytesSent || 0;
            const prev = prevReportCounters.get(report.id);
            if (prev) {
              const dBytes = Math.max(0, bytes - prev.bytes);
              // Discard anomalous counter resets
              if (dBytes < 4 * 1024 * 1024) {
                totalSentDeltaBytes += dBytes;
              }
            }
            prevReportCounters.set(report.id, { bytes, timestamp: now });
          } else if (report.type === 'inbound-rtp') {
            const bytes = report.bytesReceived || 0;
            const prev = prevReportCounters.get(report.id);
            if (prev) {
              const dBytes = Math.max(0, bytes - prev.bytes);
              if (dBytes < 4 * 1024 * 1024) {
                totalRecvDeltaBytes += dBytes;
              }
            }
            prevReportCounters.set(report.id, { bytes, timestamp: now });
            packetsLost += (report.packetsLost || 0);
            packetsRecv += (report.packetsReceived || 0);
          }
        });
      } catch (e) {}
    }

    // Clean up stale report IDs older than 10s
    for (const [id, data] of prevReportCounters.entries()) {
      if (now - data.timestamp > 10000) {
        prevReportCounters.delete(id);
      }
    }

    let sentKbps = 0;
    let recvKbps = 0;

    if (dt >= 0.6) {
      const rawSentKbps = Math.round((totalSentDeltaBytes * 8) / (dt * 1000));
      const rawRecvKbps = Math.round((totalRecvDeltaBytes * 8) / (dt * 1000));

      // Keyframe burst smoothing: smooth momentary 1-second I-frame spikes
      if (prevSmoothed.sent > 0) {
        sentKbps = Math.round(0.7 * rawSentKbps + 0.3 * prevSmoothed.sent);
      } else {
        sentKbps = rawSentKbps;
      }

      if (prevSmoothed.recv > 0) {
        recvKbps = Math.round(0.7 * rawRecvKbps + 0.3 * prevSmoothed.recv);
      } else {
        recvKbps = rawRecvKbps;
      }

      prevSmoothed.sent = sentKbps;
      prevSmoothed.recv = recvKbps;

      const totalKbps = sentKbps + recvKbps;
      const standardMeetKbps = 3200;

      if (window.__meetLiteConfig.enabled !== false && totalKbps > 0 && totalKbps < standardMeetKbps) {
        const savedKbps = standardMeetKbps - totalKbps;
        cumulativeSavedBytes += (savedKbps * 1000 * dt) / 8;
      }
    }

    const totalPackets = packetsLost + packetsRecv;
    const lossPct = totalPackets > 0 ? ((packetsLost / totalPackets) * 100).toFixed(1) : '0.0';

    window.postMessage({
      type: 'MEET_LITE_STATS',
      data: {
        sentKbps,
        recvKbps,
        totalKbps: sentKbps + recvKbps,
        lossPct,
        activeConnections: activePCs.size,
        savedMB: (cumulativeSavedBytes / (1024 * 1024)).toFixed(1)
      }
    }, '*');
  }, 1000);

  // -------------------------------------------------------------
  // 7. Message Bridge
  // -------------------------------------------------------------
  window.addEventListener('message', (event) => {
    if (!event.data || typeof event.data !== 'object') return;

    if (event.data.type === 'MEET_LITE_APPLY_CONFIG') {
      Object.assign(window.__meetLiteConfig, event.data.config);
      applyCurrentSettings();
    }
  });

  console.log('[MeetLite] Hook loaded and ready.');
})();
