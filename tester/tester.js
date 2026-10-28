/**
 * MeetLite - WebRTC Bandwidth & Savings Tester
 * Performs a real WebRTC loopback test and graphs bandwidth in real time.
 */

(function () {
  'use strict';

  // Elements
  const kpiUpload = document.getElementById('kpi-upload');
  const kpiDownload = document.getElementById('kpi-download');
  const kpiSavings = document.getElementById('kpi-savings');
  const kpiResFps = document.getElementById('kpi-res-fps');
  const videoSender = document.getElementById('video-sender');
  const videoReceiver = document.getElementById('video-receiver');
  const canvas = document.getElementById('tester-canvas');
  const ctx = canvas.getContext('2d');
  const btnStart = document.getElementById('btn-start-stream');
  const btnToggleSource = document.getElementById('btn-toggle-source');
  const btnClearGraph = document.getElementById('btn-clear-graph');
  const presetButtons = document.querySelectorAll('.btn-preset');

  // State
  let currentPreset = 'low';
  let useSynthetic = false;
  let isRunning = false;
  let activeStream = null;
  let senderPC = null;
  let receiverPC = null;
  let syntheticAnimId = null;

  let prevStats = { sentBytes: 0, recvBytes: 0, timestamp: 0 };
  const history = []; // array of { sent: number, recv: number }
  const MAX_HISTORY = 60; // 60 seconds of history

  const PRESET_CONFIGS = {
    ultra: {
      width: 160,
      height: 120,
      fps: 5,
      maxBitrate: 25 * 1000,
      title: 'Ultra-Saver',
      target: 40
    },
    low: {
      width: 320,
      height: 180,
      fps: 10,
      maxBitrate: 120 * 1000,
      title: 'Low Bandwidth',
      target: 180
    },
    balanced: {
      width: 640,
      height: 360,
      fps: 15,
      maxBitrate: 450 * 1000,
      title: 'Balanced',
      target: 500
    },
    standard: {
      width: 1280,
      height: 720,
      fps: 30,
      maxBitrate: 3200 * 1000,
      title: 'Standard Meet (Uncapped)',
      target: 3200
    }
  };

  // -------------------------------------------------------------
  // 1. Synthetic Video Generator (Fallback when no camera available)
  // -------------------------------------------------------------
  function createSyntheticStream(w, h, fps) {
    const synCanvas = document.createElement('canvas');
    synCanvas.width = w;
    synCanvas.height = h;
    const sCtx = synCanvas.getContext('2d');
    let hue = 0;
    let angle = 0;

    function renderFrame() {
      hue = (hue + 1) % 360;
      angle += 0.05;

      // Dynamic animated pattern
      sCtx.fillStyle = `hsl(${hue}, 40%, 15%)`;
      sCtx.fillRect(0, 0, w, h);

      sCtx.strokeStyle = `hsl(${(hue + 180) % 360}, 80%, 60%)`;
      sCtx.lineWidth = 4;
      sCtx.beginPath();
      sCtx.arc(w / 2 + Math.cos(angle) * (w / 4), h / 2 + Math.sin(angle) * (h / 4), Math.min(w, h) / 6, 0, Math.PI * 2);
      sCtx.stroke();

      sCtx.fillStyle = '#ffffff';
      sCtx.font = `bold ${Math.max(12, Math.floor(h / 12))}px sans-serif`;
      sCtx.textAlign = 'center';
      sCtx.fillText(`MeetLite Synthetic Feed: ${w}x${h} @ ${fps}fps`, w / 2, h / 2);

      syntheticAnimId = requestAnimationFrame(renderFrame);
    }
    renderFrame();

    return synCanvas.captureStream(fps);
  }

  // -------------------------------------------------------------
  // 2. WebRTC Loopback Setup
  // -------------------------------------------------------------
  async function startLoopback() {
    stopLoopback();
    isRunning = true;
    btnStart.textContent = '⏹ Stop Test';
    btnStart.classList.replace('primary', 'secondary');

    const cfg = PRESET_CONFIGS[currentPreset];

    try {
      if (useSynthetic) {
        activeStream = createSyntheticStream(cfg.width, cfg.height, cfg.fps);
      } else {
        try {
          activeStream = await navigator.mediaDevices.getUserMedia({
            video: {
              width: { ideal: cfg.width },
              height: { ideal: cfg.height },
              frameRate: { ideal: cfg.fps }
            },
            audio: true
          });
        } catch (camErr) {
          console.warn('[Tester] Camera permission denied or busy; switching to synthetic test stream.', camErr);
          useSynthetic = true;
          btnToggleSource.textContent = 'Switch to Real Camera';
          activeStream = createSyntheticStream(cfg.width, cfg.height, cfg.fps);
        }
      }

      videoSender.srcObject = activeStream;

      // Create PeerConnections
      senderPC = new RTCPeerConnection();
      receiverPC = new RTCPeerConnection();

      // Exchange ICE candidates
      senderPC.onicecandidate = (e) => {
        if (e.candidate) receiverPC.addIceCandidate(e.candidate).catch(() => {});
      };
      receiverPC.onicecandidate = (e) => {
        if (e.candidate) senderPC.addIceCandidate(e.candidate).catch(() => {});
      };

      // Handle incoming stream on receiver
      receiverPC.ontrack = (e) => {
        if (e.streams && e.streams[0]) {
          videoReceiver.srcObject = e.streams[0];
        }
      };

      // Add tracks to sender
      activeStream.getTracks().forEach((track) => {
        senderPC.addTrack(track, activeStream);
      });

      // SDP Offer / Answer
      const offer = await senderPC.createOffer();
      await senderPC.setLocalDescription(offer);
      await receiverPC.setRemoteDescription(offer);

      const answer = await receiverPC.createAnswer();
      await receiverPC.setLocalDescription(answer);
      await senderPC.setRemoteDescription(answer);

      // Apply initial bitrate cap
      await applyBitrateCap();

      console.log('[Tester] WebRTC Loopback established.');
    } catch (e) {
      console.error('[Tester] Loopback error:', e);
      alert('Could not start test: ' + e.message);
      stopLoopback();
    }
  }

  function stopLoopback() {
    isRunning = false;
    btnStart.textContent = '▶ Start WebRTC Live Test';
    btnStart.classList.replace('secondary', 'primary');

    if (syntheticAnimId) {
      cancelAnimationFrame(syntheticAnimId);
      syntheticAnimId = null;
    }

    if (activeStream) {
      activeStream.getTracks().forEach((t) => t.stop());
      activeStream = null;
    }

    if (senderPC) {
      senderPC.close();
      senderPC = null;
    }

    if (receiverPC) {
      receiverPC.close();
      receiverPC = null;
    }

    videoSender.srcObject = null;
    videoReceiver.srcObject = null;
    prevStats = { sentBytes: 0, recvBytes: 0, timestamp: 0 };
  }

  async function applyBitrateCap() {
    if (!senderPC) return;
    const cfg = PRESET_CONFIGS[currentPreset];

    const senders = senderPC.getSenders();
    for (const sender of senders) {
      if (!sender.track || sender.track.kind !== 'video') continue;

      const params = sender.getParameters();
      if (params && params.encodings && params.encodings.length > 0) {
        params.encodings.forEach((enc) => {
          enc.maxBitrate = cfg.maxBitrate;
          enc.maxFramerate = cfg.fps;
        });
        await sender.setParameters(params).catch(() => {});
      }
    }
  }

  // -------------------------------------------------------------
  // 3. Periodic Stats Poller (1 Hz)
  // -------------------------------------------------------------
  setInterval(async () => {
    if (!isRunning || !senderPC || !receiverPC) {
      if (!isRunning) {
        kpiUpload.textContent = '0 Kbps';
        kpiDownload.textContent = '0 Kbps';
        kpiSavings.textContent = '0%';
        kpiResFps.textContent = '-- × -- @ 0 fps';
      }
      return;
    }

    let sentBytes = 0;
    let recvBytes = 0;
    let currentFps = 0;
    let currentW = 0;
    let currentH = 0;

    try {
      const sStats = await senderPC.getStats();
      sStats.forEach((r) => {
        if (r.type === 'outbound-rtp' && r.kind === 'video') {
          sentBytes += (r.bytesSent || 0);
          if (r.framesPerSecond) currentFps = r.framesPerSecond;
          if (r.frameWidth) currentW = r.frameWidth;
          if (r.frameHeight) currentH = r.frameHeight;
        } else if (r.type === 'outbound-rtp') {
          sentBytes += (r.bytesSent || 0);
        }
      });

      const rStats = await receiverPC.getStats();
      rStats.forEach((r) => {
        if (r.type === 'inbound-rtp') {
          recvBytes += (r.bytesReceived || 0);
        }
      });
    } catch (e) {}

    const now = performance.now();
    const dt = (now - prevStats.timestamp) / 1000;

    let sentKbps = 0;
    let recvKbps = 0;

    if (prevStats.timestamp > 0 && dt >= 0.7) {
      const dSent = Math.max(0, sentBytes - prevStats.sentBytes);
      const dRecv = Math.max(0, recvBytes - prevStats.recvBytes);
      sentKbps = Math.round((dSent * 8) / (dt * 1000));
      recvKbps = Math.round((dRecv * 8) / (dt * 1000));
    }

    prevStats.sentBytes = sentBytes;
    prevStats.recvBytes = recvBytes;
    prevStats.timestamp = now;

    // Standard Meet Baseline is 3,200 Kbps
    const baseline = 3200;
    const totalKbps = sentKbps + recvKbps;
    const savingsPct = totalKbps > 0
      ? Math.max(0, Math.min(99, Math.round(((baseline - totalKbps) / baseline) * 100)))
      : (currentPreset === 'standard' ? 0 : 95);

    // Update KPIs
    kpiUpload.textContent = `${sentKbps} Kbps`;
    kpiDownload.textContent = `${recvKbps} Kbps`;
    kpiSavings.textContent = `${savingsPct}%`;

    const cfg = PRESET_CONFIGS[currentPreset];
    const dispW = currentW || cfg.width;
    const dispH = currentH || cfg.height;
    const dispFps = currentFps || cfg.fps;
    kpiResFps.textContent = `${dispW} × ${dispH} @ ${dispFps} fps`;

    // Push into history
    history.push({ sent: sentKbps, recv: recvKbps });
    if (history.length > MAX_HISTORY) history.shift();

    drawChart();
  }, 1000);

  // -------------------------------------------------------------
  // 4. Real-Time Canvas Graph Renderer
  // -------------------------------------------------------------
  function drawChart() {
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const padLeft = 60;
    const padRight = 20;
    const padTop = 25;
    const padBottom = 30;

    const plotW = w - padLeft - padRight;
    const plotH = h - padTop - padBottom;

    const maxScale = 3600; // Kbps ceiling

    // 1. Grid Lines & Axis Labels
    ctx.font = '10px -apple-system, sans-serif';
    ctx.fillStyle = '#64748b';
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;

    const gridSteps = [0, 500, 1000, 2000, 3200];
    gridSteps.forEach((val) => {
      const y = padTop + plotH - (val / maxScale) * plotH;

      ctx.beginPath();
      ctx.moveTo(padLeft, y);
      ctx.lineTo(w - padRight, y);
      ctx.stroke();

      ctx.textAlign = 'right';
      ctx.fillText(val >= 1000 ? `${(val / 1000).toFixed(1)} Mbps` : `${val}k`, padLeft - 8, y + 3);
    });

    // 2. Standard Google Meet Baseline (Red Dashed Line)
    const baselineY = padTop + plotH - (3200 / maxScale) * plotH;
    ctx.save();
    ctx.setLineDash([6, 6]);
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(padLeft, baselineY);
    ctx.lineTo(w - padRight, baselineY);
    ctx.stroke();

    ctx.fillStyle = '#ef4444';
    ctx.textAlign = 'right';
    ctx.font = 'bold 10px -apple-system, sans-serif';
    ctx.fillText('Normal Meet (~3,200 Kbps)', w - padRight - 5, baselineY - 6);
    ctx.restore();

    if (history.length < 2) {
      // Empty state prompt
      ctx.fillStyle = '#94a3b8';
      ctx.textAlign = 'center';
      ctx.font = '13px sans-serif';
      ctx.fillText(isRunning ? 'Gathering WebRTC stats...' : 'Click "Start WebRTC Live Test" to begin graphing', w / 2, h / 2);
      return;
    }

    const stepX = plotW / (MAX_HISTORY - 1);

    // 3. Draw Download Area (Green)
    ctx.beginPath();
    history.forEach((pt, i) => {
      const x = padLeft + (MAX_HISTORY - history.length + i) * stepX;
      const y = padTop + plotH - (Math.min(maxScale, pt.recv) / maxScale) * plotH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    const lastX = padLeft + (MAX_HISTORY - 1) * stepX;
    ctx.lineTo(lastX, padTop + plotH);
    ctx.lineTo(padLeft + (MAX_HISTORY - history.length) * stepX, padTop + plotH);
    ctx.closePath();
    ctx.fillStyle = 'rgba(52, 211, 153, 0.15)';
    ctx.fill();

    // Download Stroke
    ctx.beginPath();
    history.forEach((pt, i) => {
      const x = padLeft + (MAX_HISTORY - history.length + i) * stepX;
      const y = padTop + plotH - (Math.min(maxScale, pt.recv) / maxScale) * plotH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = '#34d399';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 4. Draw Upload Stroke (Cyan / Blue)
    ctx.beginPath();
    history.forEach((pt, i) => {
      const x = padLeft + (MAX_HISTORY - history.length + i) * stepX;
      const y = padTop + plotH - (Math.min(maxScale, pt.sent) / maxScale) * plotH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Current pointer circles
    const lastPt = history[history.length - 1];
    const curUploadY = padTop + plotH - (Math.min(maxScale, lastPt.sent) / maxScale) * plotH;
    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.arc(lastX, curUploadY, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  // Initial empty chart
  drawChart();

  // -------------------------------------------------------------
  // 5. Event Listeners
  // -------------------------------------------------------------
  btnStart.addEventListener('click', () => {
    if (isRunning) stopLoopback();
    else startLoopback();
  });

  btnToggleSource.addEventListener('click', () => {
    useSynthetic = !useSynthetic;
    btnToggleSource.textContent = useSynthetic ? 'Switch to Real Camera' : 'Switch to Synthetic Video';
    if (isRunning) startLoopback();
  });

  btnClearGraph.addEventListener('history', () => {
    history.length = 0;
    drawChart();
  });
  btnClearGraph.onclick = () => {
    history.length = 0;
    drawChart();
  };

  presetButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      presetButtons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      currentPreset = btn.getAttribute('data-preset');

      if (isRunning) {
        // Re-clamp in real time
        applyBitrateCap();
        // If resolution changed, re-init stream smoothly
        startLoopback();
      }
    });
  });

  // Toggle Graph Section Visibility (Test Bench)
  const btnToggleGraph = document.getElementById('btn-toggle-graph');
  const chartSection = document.querySelector('.chart-section');
  if (btnToggleGraph && chartSection) {
    btnToggleGraph.addEventListener('click', () => {
      const isHidden = chartSection.style.display === 'none';
      chartSection.style.display = isHidden ? 'block' : 'none';
      btnToggleGraph.textContent = isHidden ? 'Hide Graph' : 'Show Graph';
    });
  }

  // Simulated Cloud Server Cap (Test Bench)
  const btnMockCap360 = document.getElementById('btn-mock-cap-360');
  const btnMockCapAudio = document.getElementById('btn-mock-cap-audio');

  if (btnMockCap360) {
    btnMockCap360.addEventListener('click', async () => {
      if (!receiverPC) return;
      receiverPC.getReceivers().forEach((r) => {
        if (r.track && r.track.kind === 'video') r.track.enabled = true;
      });
      if (senderPC) {
        senderPC.getSenders().forEach((s) => {
          if (s.track && s.track.kind === 'video') {
            const p = s.getParameters();
            if (p.encodings && p.encodings[0]) {
              p.encodings[0].maxBitrate = 350 * 1000;
              s.setParameters(p).catch(() => {});
            }
          }
        });
      }
      btnMockCap360.style.background = '#dcfce7';
      btnMockCap360.style.color = '#15803d';
      if (btnMockCapAudio) {
        btnMockCapAudio.style.background = '';
        btnMockCapAudio.style.color = '';
      }
    });
  }

  if (btnMockCapAudio) {
    btnMockCapAudio.addEventListener('click', async () => {
      if (!receiverPC) return;
      receiverPC.getReceivers().forEach((r) => {
        if (r.track && r.track.kind === 'video') r.track.enabled = false;
      });
      if (senderPC) {
        senderPC.getSenders().forEach((s) => {
          if (s.track && s.track.kind === 'video') {
            const p = s.getParameters();
            if (p.encodings && p.encodings[0]) {
              p.encodings[0].maxBitrate = 10 * 1000;
              s.setParameters(p).catch(() => {});
            }
          }
        });
      }
      btnMockCapAudio.style.background = '#dcfce7';
      btnMockCapAudio.style.color = '#15803d';
      if (btnMockCap360) {
        btnMockCap360.style.background = '';
        btnMockCap360.style.color = '';
      }
    });
  }

})();
