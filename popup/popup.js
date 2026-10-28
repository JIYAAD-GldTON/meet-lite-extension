/**
 * MeetLite - Clean LITE Popup Controller
 */

document.addEventListener('DOMContentLoaded', () => {
  const statusDot = document.getElementById('status-dot');
  const statusText = document.getElementById('status-text');
  const valUpload = document.getElementById('val-upload');
  const valDownload = document.getElementById('val-download');
  const valSaved = document.getElementById('val-saved');
  const btnOpenMeet = document.getElementById('btn-open-meet');

  const chkMaster = document.getElementById('chk-master');
  const chkHud = document.getElementById('chk-hud');
  const chkGraph = document.getElementById('chk-graph');
  const presetCards = document.querySelectorAll('.preset-card');

  // 1. Immediately read cached stats from chrome.storage.local
  if (chrome && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(['meetLiteLatestStats'], (res) => {
      if (res && res.meetLiteLatestStats) {
        updateStatsUI(res.meetLiteLatestStats);
      }
    });
  }

  // 2. Load current config & set switches
  if (chrome && chrome.storage && chrome.storage.sync) {
    chrome.storage.sync.get(['meetLiteConfig'], (res) => {
      const config = res.meetLiteConfig || {};
      chkMaster.checked = config.enabled !== false;
      chkHud.checked = config.hudVisible !== false;
      if (chkGraph) chkGraph.checked = config.showGraph !== false;
      setActivePresetUI(config.preset || 'low');
    });
  }

  // Master Switch Change
  chkMaster.addEventListener('change', () => {
    chrome.storage.sync.get(['meetLiteConfig'], (res) => {
      let config = res.meetLiteConfig || {};
      config.enabled = chkMaster.checked;
      chrome.storage.sync.set({ meetLiteConfig: config });

      // Notify active Meet tabs
      chrome.tabs.query({ url: '*://meet.google.com/*' }, (tabs) => {
        tabs.forEach((tab) => {
          chrome.tabs.sendMessage(tab.id, { type: 'MEET_LITE_SET_CONFIG', config }).catch(() => {});
        });
      });
    });
  });

  // HUD Visibility Switch Change
  chkHud.addEventListener('change', () => {
    const isVisible = chkHud.checked;
    chrome.storage.sync.get(['meetLiteConfig'], (res) => {
      let config = res.meetLiteConfig || {};
      config.hudVisible = isVisible;
      chrome.storage.sync.set({ meetLiteConfig: config });

      chrome.tabs.query({ url: '*://meet.google.com/*' }, (tabs) => {
        tabs.forEach((tab) => {
          chrome.tabs.sendMessage(tab.id, { type: 'MEET_LITE_SET_HUD_VISIBLE', visible: isVisible }).catch(() => {});
        });
      });
    });
  });

  // Bandwidth Graph Switch Change
  if (chkGraph) {
    chkGraph.addEventListener('change', () => {
      const isShow = chkGraph.checked;
      chrome.storage.sync.get(['meetLiteConfig'], (res) => {
        let config = res.meetLiteConfig || {};
        config.showGraph = isShow;
        chrome.storage.sync.set({ meetLiteConfig: config });

        chrome.tabs.query({ url: '*://meet.google.com/*' }, (tabs) => {
          tabs.forEach((tab) => {
            chrome.tabs.sendMessage(tab.id, { type: 'MEET_LITE_SET_CONFIG', config }).catch(() => {});
          });
        });
      });
    });
  }

  function setActivePresetUI(preset) {
    presetCards.forEach((card) => {
      if (card.getAttribute('data-preset') === preset) {
        card.classList.add('active');
      } else {
        card.classList.remove('active');
      }
    });
  }

  function updateStatsUI(stats) {
    if (!stats) return;
    valUpload.textContent = `${stats.sentKbps || 0} Kbps`;
    valDownload.textContent = `${stats.recvKbps || 0} Kbps`;
    valSaved.textContent = `~${stats.savedMB || '0.0'} MB`;
  }

  // 3. Preset selection
  presetCards.forEach((card) => {
    card.addEventListener('click', () => {
      const preset = card.getAttribute('data-preset');
      setActivePresetUI(preset);

      chrome.storage.sync.get(['meetLiteConfig'], (res) => {
        let config = res.meetLiteConfig || {};
        config.preset = preset;

        if (preset === 'ultra') {
          config.outgoingVideoQuality = 'off';
          config.outgoingMaxFps = 5;
          config.outgoingVideoMaxKbps = 20;
          config.incomingVideoMode = 'audio_only';
          config.audioSaver = true;
          config.freezeInactiveTab = true;
        } else if (preset === 'low') {
          config.outgoingVideoQuality = '180p';
          config.outgoingMaxFps = 10;
          config.outgoingVideoMaxKbps = 120;
          config.incomingVideoMode = 'audio_only';
          config.audioSaver = true;
          config.freezeInactiveTab = true;
        } else if (preset === 'balanced') {
          config.outgoingVideoQuality = '360p';
          config.outgoingMaxFps = 15;
          config.outgoingVideoMaxKbps = 400;
          config.incomingVideoMode = 'low';
          config.audioSaver = false;
          config.freezeInactiveTab = true;
        }

        chrome.storage.sync.set({ meetLiteConfig: config });
      });
    });
  });

  // 4. Poll active Meet tab directly for live data
  function refreshLiveData() {
    chrome.tabs.query({ url: '*://meet.google.com/*' }, (tabs) => {
      if (tabs && tabs.length > 0) {
        statusDot.className = 'status-dot active';
        statusText.textContent = 'Active in Meet';

        chrome.tabs.sendMessage(tabs[0].id, { type: 'MEET_LITE_QUERY_STATS' }, (resp) => {
          if (chrome.runtime.lastError) return;
          if (resp && resp.stats) {
            updateStatsUI(resp.stats);
          }
          if (resp && resp.config) {
            chkMaster.checked = resp.config.enabled !== false;
            chkHud.checked = resp.config.hudVisible !== false;
          }
        });
      } else {
        statusDot.className = 'status-dot';
        statusText.textContent = 'Standing By';
      }
    });

    chrome.storage.local.get(['meetLiteLatestStats'], (res) => {
      if (res && res.meetLiteLatestStats) {
        updateStatsUI(res.meetLiteLatestStats);
      }
    });
  }

  refreshLiveData();
  const pollTimer = setInterval(refreshLiveData, 1000);
  window.addEventListener('unload', () => clearInterval(pollTimer));

  // Open or focus Google Meet
  btnOpenMeet.addEventListener('click', () => {
    chrome.tabs.query({ url: '*://meet.google.com/*' }, (tabs) => {
      if (tabs && tabs.length > 0) {
        chrome.tabs.update(tabs[0].id, { active: true });
      } else {
        chrome.tabs.create({ url: 'https://meet.google.com' });
      }
      window.close();
    });
  });

  // Open WebRTC Bandwidth Tester & Live Graph
  const btnOpenTester = document.getElementById('btn-open-tester');
  if (btnOpenTester) {
    btnOpenTester.addEventListener('click', () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('tester/tester.html') });
      window.close();
    });
  }
});
