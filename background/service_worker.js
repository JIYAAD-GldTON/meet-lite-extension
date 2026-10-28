/**
 * MeetLite - Clean LITE Background Service Worker
 */

const DEFAULT_CONFIG = {
  enabled: true,
  hudVisible: true,
  showGraph: true,
  screenShareQuality: 'hd',
  preset: 'low',
  outgoingVideoQuality: '180p',
  outgoingMaxFps: 10,
  outgoingVideoMaxKbps: 120,
  incomingVideoMode: 'audio_only',
  audioSaver: true,
  freezeInactiveTab: true,
  isMinimized: false
};

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get(['meetLiteConfig'], (result) => {
    if (!result.meetLiteConfig) {
      chrome.storage.sync.set({ meetLiteConfig: DEFAULT_CONFIG });
    }
  });

  chrome.action.setBadgeText({ text: 'LITE' });
  chrome.action.setBadgeBackgroundColor({ color: '#2563eb' });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'MEET_LITE_STATS_UPDATE') {
    const stats = message.stats;

    // Cache latest stats into local storage
    chrome.storage.local.set({ meetLiteLatestStats: stats });

    // Update toolbar badge
    if (stats.activeConnections > 0) {
      const kbps = stats.totalKbps;
      let badgeText = `${kbps}k`;
      if (kbps >= 1000) {
        badgeText = `${(kbps / 1000).toFixed(1)}M`;
      }
      chrome.action.setBadgeText({ text: badgeText });
      chrome.action.setBadgeBackgroundColor({ color: kbps < 300 ? '#10b981' : '#2563eb' });
    } else {
      chrome.action.setBadgeText({ text: 'ON' });
      chrome.action.setBadgeBackgroundColor({ color: '#2563eb' });
    }
    sendResponse({ received: true });
  }
  return true;
});
