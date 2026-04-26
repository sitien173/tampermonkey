// ==UserScript==
// @name         Cookie Updater V2
// @description  Minimal Udemy cookie sync
// @namespace    https://greasyfork.org/users/1508709
// @version      2.0.0
// @author       https://github.com/sitien173
// @match        *://*.udemy.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_cookie
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @connect      cf-api-gateway.sitienbmt.workers.dev
// @run-at       document-start
// @downloadURL  https://pub-34da56ee366741478de3aa5bf175e13e.r2.dev/cookie-updater-v2.user.js
// @updateURL    https://pub-34da56ee366741478de3aa5bf175e13e.r2.dev/cookie-updater-v2.meta.js
// @source       https://github.com/sitien173/tampermonkey
// ==/UserScript==

(function () {
  'use strict';

  const workerUrl = 'https://cf-api-gateway.sitienbmt.workers.dev/udemy/v2';
  const CONFIG_KEY = 'cookieUpdaterV2Config';
  const DEVICE_ID_KEY = 'deviceId';
  const DEFAULT_CONFIG = {
    licenseKey: '',
    apiKey: 'ZDksovkGHYUqwK8k9hoDCKHSP2geS6WB',
    retryAttempts: 3,
    autoRun: true,
  };

  let config = { ...DEFAULT_CONFIG };
  let isSyncing = false;
  let overlayMounted = false;
  let overlayEls = null;

  function loadConfig() {
    const saved = GM_getValue(CONFIG_KEY, {});
    config = { ...DEFAULT_CONFIG, ...(saved && typeof saved === 'object' ? saved : {}) };
  }

  function saveConfig() {
    GM_setValue(CONFIG_KEY, config);
  }

  function getOrCreateDeviceId() {
    let id = GM_getValue(DEVICE_ID_KEY, '');
    if (!id) {
      try {
        if (crypto && crypto.randomUUID) {
          id = crypto.randomUUID();
        }
      } catch (_error) {
        void _error;
      }
      if (!id) {
        id = Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
      }
      id = id.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
      GM_setValue(DEVICE_ID_KEY, id);
    }
    return id;
  }

  function hasCookieApi() {
    return (
      typeof GM_cookie !== 'undefined' &&
      GM_cookie &&
      typeof GM_cookie.list === 'function' &&
      typeof GM_cookie.delete === 'function' &&
      typeof GM_cookie.set === 'function'
    );
  }

  function ensureOverlayMounted() {
    if (overlayMounted && overlayEls && overlayEls.container.isConnected) {
      return;
    }

    const root = document.documentElement || document.body;
    if (!root) {
      document.addEventListener(
        'DOMContentLoaded',
        () => {
          ensureOverlayMounted();
        },
        { once: true }
      );
      return;
    }

    const style = document.createElement('style');
    style.textContent = [
      '#cuv2-overlay{position:fixed;top:10px;right:10px;z-index:2147483647;background:#121212;color:#fff;border:1px solid #303030;',
      'border-radius:8px;padding:10px;min-width:260px;max-width:320px;font:12px/1.35 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;',
      'box-shadow:0 8px 30px rgba(0,0,0,.35)}',
      '#cuv2-status{margin:0 0 8px;word-break:break-word}',
      '#cuv2-license-row{display:flex;gap:6px;margin:0 0 8px}',
      '#cuv2-license-input{flex:1;min-width:0;padding:4px 6px;border:1px solid #3a3a3a;background:#1e1e1e;color:#fff;border-radius:5px}',
      '#cuv2-controls{display:flex;gap:6px;flex-wrap:wrap}',
      '.cuv2-btn{padding:4px 8px;border:1px solid #3a3a3a;background:#232323;color:#fff;border-radius:5px;cursor:pointer;font-size:12px}',
      '.cuv2-btn:disabled{opacity:.55;cursor:not-allowed}',
    ].join('');

    const container = document.createElement('div');
    container.id = 'cuv2-overlay';
    container.innerHTML = [
      '<div id="cuv2-status">Initializing...</div>',
      '<div id="cuv2-license-row">',
      '<input id="cuv2-license-input" type="text" placeholder="Enter license key" />',
      '<button id="cuv2-save-license" class="cuv2-btn" type="button">Save</button>',
      '</div>',
      '<div id="cuv2-controls">',
      '<button id="cuv2-retry" class="cuv2-btn" type="button">Retry</button>',
      '<button id="cuv2-run-now" class="cuv2-btn" type="button">Run now</button>',
      '</div>',
    ].join('');

    root.appendChild(style);
    root.appendChild(container);

    overlayEls = {
      container,
      status: container.querySelector('#cuv2-status'),
      licenseRow: container.querySelector('#cuv2-license-row'),
      licenseInput: container.querySelector('#cuv2-license-input'),
      saveLicense: container.querySelector('#cuv2-save-license'),
      retry: container.querySelector('#cuv2-retry'),
      runNow: container.querySelector('#cuv2-run-now'),
    };

    overlayEls.saveLicense.addEventListener('click', async () => {
      const nextLicense = (overlayEls.licenseInput.value || '').trim();
      config.licenseKey = nextLicense;
      saveConfig();
      if (!nextLicense) {
        setOverlayState('need-license');
        return;
      }
      await runCookieSync('overlay-save');
    });

    overlayEls.retry.addEventListener('click', async () => {
      await runCookieSync('overlay-retry');
    });

    overlayEls.runNow.addEventListener('click', async () => {
      await runCookieSync('overlay-run-now');
    });

    overlayMounted = true;
  }

  function setDisabled(disabled) {
    if (!overlayEls) return;
    overlayEls.saveLicense.disabled = disabled;
    overlayEls.retry.disabled = disabled;
    overlayEls.runNow.disabled = disabled;
    overlayEls.licenseInput.disabled = disabled;
  }

  function setOverlayState(state, details) {
    ensureOverlayMounted();
    if (!overlayEls) return;

    const info = details || {};
    const msg = info.message || '';

    overlayEls.retry.style.display = 'none';
    overlayEls.licenseRow.style.display = 'none';
    overlayEls.runNow.style.display = 'inline-block';
    setDisabled(false);

    if (state === 'need-license') {
      overlayEls.status.textContent = 'License required. Enter key to sync.';
      overlayEls.licenseRow.style.display = 'flex';
      overlayEls.licenseInput.value = config.licenseKey || '';
      overlayEls.retry.style.display = 'none';
      overlayEls.runNow.style.display = 'none';
      return;
    }

    if (state === 'fetching') {
      overlayEls.status.textContent = 'Fetching cookies...';
      setDisabled(true);
      return;
    }

    if (state === 'applying') {
      overlayEls.status.textContent = 'Applying cookies...';
      setDisabled(true);
      return;
    }

    if (state === 'success') {
      const savedCount = info.savedCount || 0;
      const failedCount = info.failedCount || 0;
      overlayEls.status.textContent =
        failedCount > 0
          ? `Saved ${savedCount}, failed ${failedCount}. Reloading...`
          : `Saved ${savedCount} cookie(s). Reloading...`;
      return;
    }

    overlayEls.status.textContent = msg || 'Sync failed.';
    overlayEls.retry.style.display = 'inline-block';
    overlayEls.runNow.style.display = 'inline-block';
    if (info.showLicenseInput) {
      overlayEls.licenseRow.style.display = 'flex';
      overlayEls.licenseInput.value = config.licenseKey || '';
    }
  }

  function requestWorkerCookies() {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        headers: {
          'X-API-Key': config.apiKey,
        },
        timeout: 15000,
        url:
          workerUrl +
          '?key=' +
          encodeURIComponent(config.licenseKey) +
          '&device=' +
          encodeURIComponent(getOrCreateDeviceId()),
        onload: function (response) {
          if (response.status !== 200) {
            reject(new Error(`Worker error: HTTP ${response.status}`));
            return;
          }

          if (response.responseText === '{}') {
            const err = new Error('Invalid license key');
            err.code = 'INVALID_LICENSE';
            reject(err);
            return;
          }

          let data;
          try {
            data = JSON.parse(response.responseText);
          } catch {
            reject(new Error('Worker returned invalid JSON'));
            return;
          }

          if (data && data.error) {
            const err = new Error(data.error || 'Invalid license key');
            err.code = 'INVALID_LICENSE';
            reject(err);
            return;
          }

          if (!Array.isArray(data)) {
            reject(new Error('Worker returned invalid response format'));
            return;
          }

          resolve(data);
        },
        ontimeout: function () {
          reject(new Error('Worker request timed out'));
        },
        onerror: function () {
          reject(new Error('Worker request failed'));
        },
      });
    });
  }

  async function fetchCookiesWithRetry() {
    let lastError = null;
    for (let attempt = 1; attempt <= config.retryAttempts; attempt += 1) {
      try {
        return await requestWorkerCookies();
      } catch (error) {
        lastError = error;
        if (attempt < config.retryAttempts) {
          await new Promise((resolve) => setTimeout(resolve, 700));
        }
      }
    }
    throw lastError || new Error('Failed to fetch cookies from worker');
  }

  function normalizeCookie(cookie, url) {
    const normalized = {
      name: cookie.name || '',
      value: cookie.value || '',
      url,
      path: cookie.path || '/',
      secure: !!cookie.secure,
      httpOnly: !!cookie.httpOnly,
      expirationDate:
        typeof cookie.expirationDate === 'number' ? cookie.expirationDate : cookie.expirationDate || null,
    };

    if (!cookie.hostOnly && cookie.domain) {
      normalized.domain = cookie.domain;
    }

    let sameSite = cookie.sameSite ? String(cookie.sameSite).toLowerCase() : 'no_restriction';
    if (sameSite === 'none' || sameSite === 'no_restriction') {
      sameSite = 'none';
      normalized.secure = true;
    } else if (sameSite === 'lax') {
      sameSite = 'lax';
    } else if (sameSite === 'strict') {
      sameSite = 'strict';
    } else {
      sameSite = 'no_restriction';
    }
    normalized.sameSite = sameSite;

    if (cookie.session) {
      normalized.expirationDate = null;
    }

    return normalized;
  }

  function listCookiesForUrl(url) {
    return new Promise((resolve, reject) => {
      GM_cookie.list({ url }, (cookies, error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(Array.isArray(cookies) ? cookies : []);
      });
    });
  }

  function setCookie(details) {
    return new Promise((resolve, reject) => {
      GM_cookie.set(details, (result, error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(result);
      });
    });
  }

  function deleteCookie(details) {
    return new Promise((resolve, reject) => {
      GM_cookie.delete(details, (result, error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(result);
      });
    });
  }

  function domainMatchesHost(cookie, host) {
    if (!cookie.domain) return true;
    const hostLc = String(host || '').toLowerCase();
    const domainLc = String(cookie.domain || '').replace(/^\./, '').toLowerCase();
    if (!domainLc) return true;
    if (cookie.hostOnly) return hostLc === domainLc;
    return hostLc === domainLc || hostLc.endsWith('.' + domainLc);
  }

  function dedupeByNamePathDomain(cookies) {
    const map = new Map();
    for (const cookie of cookies) {
      const key = [
        cookie.name || '',
        cookie.path || '/',
        cookie.hostOnly ? 'hostOnly' : String(cookie.domain || '').toLowerCase(),
      ].join('||');
      map.set(key, cookie);
    }
    return Array.from(map.values());
  }

  async function applyCookiesForCurrentHost(fetchedCookies) {
    const currentUrl = window.location.origin + '/';
    const currentHost = window.location.hostname;
    const hostCookies = dedupeByNamePathDomain(
      fetchedCookies.filter((cookie) => domainMatchesHost(cookie, currentHost))
    );

    if (hostCookies.length === 0) {
      const err = new Error(`No cookies found for ${currentHost}`);
      err.code = 'EMPTY_DOMAIN';
      throw err;
    }

    const existingCookies = await listCookiesForUrl(currentUrl);
    const targetNames = new Set(hostCookies.map((cookie) => cookie.name).filter(Boolean));

    let deleteFailCount = 0;
    for (const existing of existingCookies) {
      if (!targetNames.has(existing.name)) continue;
      if (!domainMatchesHost(existing, currentHost)) continue;

      const domainVariants = [];
      if (existing.domain) {
        const base = String(existing.domain).replace(/^\./, '');
        domainVariants.push(existing.domain, base, '.' + base);
      }
      if (domainVariants.length === 0) domainVariants.push(undefined);

      let removed = false;
      for (const domain of domainVariants) {
        try {
          const args = { name: existing.name, url: currentUrl, path: existing.path || '/' };
          if (domain) args.domain = domain;
          await deleteCookie(args);
          removed = true;
          break;
        } catch (_error) {
          void _error;
        }
      }
      if (!removed) {
        deleteFailCount += 1;
      }
    }

    let savedCount = 0;
    let saveFailCount = 0;
    for (const cookie of hostCookies) {
      try {
        const normalized = normalizeCookie(cookie, currentUrl);
        await setCookie(normalized);
        savedCount += 1;
      } catch {
        saveFailCount += 1;
      }
    }

    return {
      savedCount,
      failedCount: deleteFailCount + saveFailCount,
      totalCount: hostCookies.length,
    };
  }

  async function runCookieSync(source) {
    ensureOverlayMounted();
    if (isSyncing) {
      return { success: false, message: `Already syncing (${source || 'unknown'}).` };
    }

    if (!config.licenseKey) {
      setOverlayState('need-license');
      return { success: false, message: 'License required' };
    }

    if (!hasCookieApi()) {
      setOverlayState('error', {
        message: 'Tampermonkey cookie permission is required (GM_cookie unavailable).',
        showLicenseInput: true,
      });
      return { success: false, message: 'GM_cookie unavailable' };
    }

    isSyncing = true;
    try {
      setOverlayState('fetching');
      const cookies = await fetchCookiesWithRetry();
      if (cookies.length === 0) {
        setOverlayState('error', { message: 'Worker returned empty cookie list.' });
        return { success: false, message: 'No cookies returned' };
      }

      setOverlayState('applying');
      const result = await applyCookiesForCurrentHost(cookies);
      if (result.savedCount > 0) {
        setOverlayState('success', result);
        setTimeout(() => {
          window.location.reload();
        }, 900);
        return { success: true, ...result };
      }

      setOverlayState('error', {
        message: `Failed to save cookies. Saved 0, failed ${result.failedCount}.`,
      });
      return { success: false, ...result };
    } catch (error) {
      const message = error && error.message ? error.message : 'Cookie sync failed';
      const invalidLicense = error && error.code === 'INVALID_LICENSE';
      setOverlayState('error', {
        message,
        showLicenseInput: invalidLicense,
      });
      return { success: false, message };
    } finally {
      isSyncing = false;
    }
  }

  function registerMenuCommands() {
    GM_registerMenuCommand('Set License Key (V2)', async () => {
      const next = prompt('Enter license key', config.licenseKey || '');
      if (next === null) return;
      config.licenseKey = (next || '').trim();
      saveConfig();
      if (!config.licenseKey) {
        setOverlayState('need-license');
        return;
      }
      await runCookieSync('menu-set-license');
    });

    GM_registerMenuCommand('Run Cookie Sync Now (V2)', async () => {
      await runCookieSync('menu-run-now');
    });

    GM_registerMenuCommand(`Auto Run: ${config.autoRun ? 'ON' : 'OFF'} (V2)`, () => {
      config.autoRun = !config.autoRun;
      saveConfig();
      if (!config.autoRun) {
        setOverlayState('error', { message: 'Auto-run disabled. Use Run now to sync.' });
      } else if (config.licenseKey) {
        runCookieSync('menu-auto-run-enabled');
      } else {
        setOverlayState('need-license');
      }
    });
  }

  function initialize() {
    loadConfig();
    ensureOverlayMounted();
    registerMenuCommands();

    if (!config.licenseKey) {
      setOverlayState('need-license');
      return;
    }

    if (!config.autoRun) {
      setOverlayState('error', { message: 'Auto-run disabled. Use Run now to sync.' });
      return;
    }

    runCookieSync('startup');
  }

  initialize();
})();
