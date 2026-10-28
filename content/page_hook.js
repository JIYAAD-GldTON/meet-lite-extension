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
  let dummyCanvasTrack = null;

  function getDummyTrack() {
    if (!dummyCanvasTrack) {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 16;
        canvas.height = 16;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#111111';
          ctx.fillRect(0, 0, 16, 16);
        }
        const stream = canvas.captureStream(1);
        dummyCanvasTrack = stream.getVideoTracks()[0];
      } catch (e) {
        dummyCanvasTrack = null;
      }
    }
    return dummyCanvasTrack;
  }

  // -------------------------------------------------------------
  // 1. Intercept getUserMedia (Safe Hardware Resolution Clamping)
  // -------------------------------------------------------------
  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    const origGUM = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);

    navigator.mediaDevices.getUserMedia = async function (constraints) {
      const config = window.__meetLiteConfig;

      // If MeetLite is disabled, pass through original constraints
      if (config.enabled === false) {
        return origGUM(constraints);
      }

      if (constraints && constraints.video) {
        if (config.outgoingVideoQuality === 'off') {
          console.log('[MeetLite] Outgoing video is OFF. Providing dummy track.');
          const dummy = getDummyTrack();
          if (constraints.audio && dummy) {
            const audioStream = await origGUM({ audio: constraints.audio });
            dummy.enabled = false;
            audioStream.addTrack(dummy);
            return audioStream;
          } else if (dummy) {
            return new MediaStream([dummy]);
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

        if (typeof constraints.video === 'boolean') {
          constraints.video = {
            width: { ideal: idealW },
            height: { ideal: idealH },
            frameRate: { ideal: config.outgoingMaxFps || 10 }
          };
        } else if (typeof constraints.video === 'object') {
          constraints.video.width = { ideal: idealW };
          constraints.video.height = { ideal: idealH };
          if (config.outgoingMaxFps) {
            constraints.video.frameRate = { ideal: config.outgoingMaxFps };
          }
        }
      }

      return origGUM(constraints);
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
  }

  // -------------------------------------------------------------
  // 3. Intercept RTCRtpSender.setParameters (Bitrate Capping)
  // -------------------------------------------------------------
  if (window.RTCRtpSender && RTCRtpSender.prototype.setParameters) {
    const origSetParameters = RTCRtpSender.prototype.setParameters;
    RTCRtpSender.prototype.setParameters = async function (params) {
      const config = window.__meetLiteConfig;

      if (config.enabled === false) {
        return origSetParameters.apply(this, arguments);
      }

      if (params && params.encodings && params.encodings.length > 0) {
        if (this.track && this.track.kind === 'video') {
          const capBps = (config.outgoingVideoMaxKbps || 120) * 1000;
          params.encodings.forEach((enc) => {
            enc.maxBitrate = capBps;
            if (config.outgoingMaxFps) {
              enc.maxFramerate = config.outgoingMaxFps;
            }
          });
        }
        if (this.track && this.track.kind === 'audio' && config.audioSaver) {
          const audioCapBps = 20 * 1000; // 20 Kbps
          params.encodings.forEach((enc) => {
            enc.maxBitrate = audioCapBps;
          });
        }
      }
      return origSetParameters.apply(this, arguments);
    };
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
        // Enforce senders
        const senders = pc.getSenders();
        for (const sender of senders) {
          if (!sender.track) continue;

          if (sender.track.kind === 'video') {
            sender.track.enabled = (config.outgoingVideoQuality !== 'off');

            const params = sender.getParameters();
            if (params && params.encodings && params.encodings.length > 0) {
              const capBps = (config.outgoingVideoMaxKbps || 120) * 1000;
              params.encodings.forEach((enc) => {
                enc.maxBitrate = capBps;
                if (config.outgoingMaxFps) enc.maxFramerate = config.outgoingMaxFps;
              });
              await sender.setParameters(params).catch(() => {});
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
        // Enforce receivers (incoming video)
        const receivers = pc.getReceivers();
        for (const receiver of receivers) {
          if (receiver.track && receiver.track.kind === 'video') {
            receiver.track.enabled = (config.incomingVideoMode !== 'audio_only');
          }
        }
      } catch (e) {}
    }
  }

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
  // -------------------------------------------------------------
  let prevStats = {
    sentBytes: 0,
    recvBytes: 0,
    timestamp: 0
  };
  let cumulativeSavedBytes = 0;

  setInterval(async () => {
    let totalSent = 0;
    let totalRecv = 0;
    let packetsLost = 0;
    let packetsRecv = 0;

    for (const pc of activePCs) {
      if (pc.connectionState === 'closed') continue;
      try {
        const stats = await pc.getStats();
        let pcRtpSent = 0;
        let pcRtpRecv = 0;
        let pcTransportSent = 0;
        let pcTransportRecv = 0;

        stats.forEach((report) => {
          if (report.type === 'outbound-rtp') {
            pcRtpSent += (report.bytesSent || 0);
          } else if (report.type === 'inbound-rtp') {
            pcRtpRecv += (report.bytesReceived || 0);
            packetsLost += (report.packetsLost || 0);
            packetsRecv += (report.packetsReceived || 0);
          } else if (report.type === 'candidate-pair' && (report.nominated || report.state === 'succeeded')) {
            pcTransportSent = Math.max(pcTransportSent, report.bytesSent || 0);
            pcTransportRecv = Math.max(pcTransportRecv, report.bytesReceived || 0);
          } else if (report.type === 'transport') {
            pcTransportSent = Math.max(pcTransportSent, report.bytesSent || 0);
            pcTransportRecv = Math.max(pcTransportRecv, report.bytesReceived || 0);
          }
        });

        totalSent += Math.max(pcRtpSent, pcTransportSent);
        totalRecv += Math.max(pcRtpRecv, pcTransportRecv);
      } catch (e) {}
    }

    const now = performance.now();
    const dt = (now - prevStats.timestamp) / 1000;

    let sentKbps = 0;
    let recvKbps = 0;

    if (prevStats.timestamp > 0 && dt >= 0.7) {
      const sentDelta = Math.max(0, totalSent - prevStats.sentBytes);
      const recvDelta = Math.max(0, totalRecv - prevStats.recvBytes);

      sentKbps = Math.round((sentDelta * 8) / (dt * 1000));
      recvKbps = Math.round((recvDelta * 8) / (dt * 1000));

      const totalKbps = sentKbps + recvKbps;
      const standardMeetKbps = 3200;

      if (window.__meetLiteConfig.enabled !== false && totalKbps > 0 && totalKbps < standardMeetKbps) {
        const savedKbps = standardMeetKbps - totalKbps;
        cumulativeSavedBytes += (savedKbps * 1000 * dt) / 8;
      }
    }

    if (totalSent > 0 || totalRecv > 0) {
      prevStats.sentBytes = totalSent;
      prevStats.recvBytes = totalRecv;
      prevStats.timestamp = now;
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
