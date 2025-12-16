// ==UserScript==
// @name         Cookie Updater
// @description  udemy cookies + organize courses
// @namespace    https://greasyfork.org/users/1508709
// @version      3.0.1
// @author       https://github.com/sitien173
// @match        *://*.udemy.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_cookie
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @connect      udemy-cookies-worker-commercial.sitienbmt.workers.dev
// @run-at       document-start
// @require      https://pub-34da56ee366741478de3aa5bf175e13e.r2.dev/cookie-updater.js
// @downloadURL  https://update.greasyfork.org/scripts/547313/Cookie%20Updater.user.js
// @updateURL    https://update.greasyfork.org/scripts/547313/Cookie%20Updater.meta.js
// @source       https://github.com/sitien173/tampermonkey
// ==/UserScript==
(function () {
  'use strict';

  const workerUrl = 'https://udemy-cookies-worker-commercial.sitienbmt.workers.dev';
  const DEFAULT_CONFIG = {
    licenseKey: '',
    retryAttempts: 3,
    showUiButtons: true,
    showFolderOrganizer: true
  };
  let config = {
    ...DEFAULT_CONFIG
  };
  let folders = [];
  let isOrganizerPopupOpen = false;
  let isSyncing = false;
  let lastSyncTime = 0;
  function loadConfig() {
    const savedConfig = GM_getValue('config', {});
    config = {
      ...DEFAULT_CONFIG,
      ...savedConfig
    };
  }
  function saveConfig() {
    GM_setValue('config', config);
  }
  function getOrCreateDeviceId() {
    let id = GM_getValue('deviceId', '');
    if (!id) {
      try {
        if (crypto && crypto.randomUUID) {
          id = crypto.randomUUID();
        }
      } catch {
      }
      if (!id) {
        id = Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
      }
      id = id.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
      GM_setValue('deviceId', id);
    }
    return id;
  }

  function getUserInfo() {
    const totalCourses = folders.reduce((sum, f) => {
      var _f$courses;
      return sum + (((_f$courses = f.courses) === null || _f$courses === void 0 ? void 0 : _f$courses.length) || f.course_count || 0);
    }, 0);
    return {
      licenseKey: config.licenseKey ? config.licenseKey.slice(0, 8) + '****' : 'Not set',
      deviceId: getOrCreateDeviceId().slice(0, 12) + '...',
      totalFolders: folders.length,
      totalCourses: totalCourses
    };
  }

  function apiRequest(method, endpoint, body = null) {
    return new Promise((resolve, reject) => {
      const url = workerUrl + endpoint;
      GM_xmlhttpRequest({
        method: method,
        url: url,
        headers: {
          'Content-Type': 'application/json',
          'X-License-Key': config.licenseKey,
          'X-Device-Id': getOrCreateDeviceId()
        },
        data: body ? JSON.stringify(body) : null,
        onload: function (response) {
          try {
            const data = JSON.parse(response.responseText);
            if (response.status >= 200 && response.status < 300) {
              resolve(data);
            } else {
              reject(new Error(data.error || `HTTP ${response.status}`));
            }
          } catch {
            reject(new Error('Invalid JSON response'));
          }
        },
        onerror: function (_error) {
          reject(new Error('Network error'));
        }
      });
    });
  }

  async function syncFoldersFromServer() {
    if (!config.licenseKey) {
      loadFoldersFromLocal();
      return;
    }
    if (isSyncing) return;
    isSyncing = true;
    try {
      const data = await apiRequest('GET', '/api/sync');
      folders = data.folders || [];
      lastSyncTime = data.synced_at || Date.now();

      GM_setValue('cachedFolders', folders);
      GM_setValue('lastSyncTime', lastSyncTime);
    } catch (error) {
      console.error('Failed to sync from server:', error);
      loadFoldersFromLocal();
    } finally {
      isSyncing = false;
    }
  }
  function loadFoldersFromLocal() {
    const cached = GM_getValue('cachedFolders', null);
    if (cached && Array.isArray(cached)) {
      folders = cached;
    } else {
      folders = [{
        id: 1,
        name: 'My Courses',
        color: '#6366f1',
        courses: [],
        course_count: 0
      }, {
        id: 2,
        name: 'Favorites',
        color: '#ec4899',
        courses: [],
        course_count: 0
      }, {
        id: 3,
        name: 'In Progress',
        color: '#f59e0b',
        courses: [],
        course_count: 0
      }, {
        id: 4,
        name: 'Completed',
        color: '#10b981',
        courses: [],
        course_count: 0
      }];
    }
  }
  async function initDefaultFolders() {
    if (!config.licenseKey) return;
    try {
      await apiRequest('POST', '/api/init');
      await syncFoldersFromServer();
    } catch (error) {
      console.error('Failed to initialize default folders:', error);
    }
  }
  async function createFolderAPI(name, color) {
    if (!config.licenseKey) {
      const newFolder = {
        id: Date.now(),
        name: name,
        color: color,
        courses: [],
        course_count: 0
      };
      folders.push(newFolder);
      GM_setValue('cachedFolders', folders);
      return newFolder;
    }
    const data = await apiRequest('POST', '/api/folders', {
      name,
      color
    });
    await syncFoldersFromServer();
    return data.folder;
  }
  async function updateFolderAPI(folderId, updates) {
    if (!config.licenseKey) {
      const folder = folders.find(f => f.id === folderId);
      if (folder) {
        Object.assign(folder, updates);
        GM_setValue('cachedFolders', folders);
      }
      return folder;
    }
    const data = await apiRequest('PUT', `/api/folders/${folderId}`, updates);
    await syncFoldersFromServer();
    return data.folder;
  }
  async function deleteFolderAPI(folderId) {
    if (!config.licenseKey) {
      folders = folders.filter(f => f.id !== folderId);
      GM_setValue('cachedFolders', folders);
      return;
    }
    await apiRequest('DELETE', `/api/folders/${folderId}`);
    await syncFoldersFromServer();
  }
  async function addCourseToFoldersAPI(folderIds, courseInfo) {
    if (!config.licenseKey) {
      let added = 0;
      folderIds.forEach(folderId => {
        const folder = folders.find(f => f.id === folderId);
        if (folder) {
          if (!folder.courses) folder.courses = [];
          const exists = folder.courses.some(c => c.udemy_course_id === courseInfo.id || c.id === courseInfo.id);
          if (!exists) {
            folder.courses.push({
              udemy_course_id: courseInfo.id,
              title: courseInfo.title,
              url: courseInfo.url,
              image_url: courseInfo.image,
              instructor: courseInfo.instructor,
              added_at: Math.floor(Date.now() / 1000)
            });
            folder.course_count = folder.courses.length;
            added++;
          }
        }
      });
      GM_setValue('cachedFolders', folders);
      return {
        added
      };
    }
    const data = await apiRequest('POST', '/api/courses/add-to-folders', {
      folder_ids: folderIds,
      course_id: courseInfo.id,
      title: courseInfo.title,
      url: courseInfo.url,
      image_url: courseInfo.image,
      instructor: courseInfo.instructor
    });
    await syncFoldersFromServer();
    return data;
  }
  async function removeCourseFromFolderAPI(folderId, courseId) {
    if (!config.licenseKey) {
      const folder = folders.find(f => f.id === folderId);
      if (folder && folder.courses) {
        const beforeCount = folder.courses.length;
        folder.courses = folder.courses.filter(c => {
          const cId = c.course_id || c.id;
          return cId !== courseId && cId !== String(courseId);
        });
        folder.course_count = folder.courses.length;
      }
      GM_setValue('cachedFolders', folders);
      return;
    }
    try {
      const result = await apiRequest('DELETE', `/api/folders/${folderId}/courses/${courseId}`);
      await syncFoldersFromServer();
    } catch (error) {
      console.error('API DELETE error:', error);
      throw error;
    }
  }
  async function loadCoursesForFolder(folderId) {
    if (!config.licenseKey) {
      const folder = folders.find(f => f.id === folderId);
      return (folder === null || folder === void 0 ? void 0 : folder.courses) || [];
    }
    try {
      const data = await apiRequest('GET', `/api/folders/${folderId}/courses`);
      const folder = folders.find(f => f.id === folderId);
      if (folder) {
        folder.courses = data.courses || [];
      }
      return data.courses || [];
    } catch (error) {
      console.error('Failed to load courses:', error);
      const folder = folders.find(f => f.id === folderId);
      return (folder === null || folder === void 0 ? void 0 : folder.courses) || [];
    }
  }

  async function fetchCookiesFromWorker() {
    let lastError;
    for (let attempt = 1; attempt <= config.retryAttempts; attempt++) {
      try {
        return new Promise((resolve, reject) => {
          GM_xmlhttpRequest({
            method: 'GET',
            url: workerUrl + '?key=' + encodeURIComponent(config.licenseKey) + '&device=' + encodeURIComponent(getOrCreateDeviceId()),
            onload: function (response) {
              if (response.status === 200) {
                try {
                  if (response.responseText === '{}') {
                    reject(new Error('Invalid license key'));
                    return;
                  }
                  const data = JSON.parse(response.responseText);
                  if (data.error) {
                    reject(new Error(data.error));
                    return;
                  }
                  if (Array.isArray(data)) {
                    resolve(data);
                  } else {
                    reject(new Error('Invalid response format'));
                  }
                } catch (error) {
                  console.error('Failed to parse JSON response:', error);
                  reject(error);
                }
              } else {
                reject(new Error(`HTTP ${response.status}: ${response.statusText}`));
              }
            },
            onerror: function (error) {
              console.error('Network error:', error);
              reject(error);
            }
          });
        });
      } catch (error) {
        lastError = error;
        console.error(`Attempt ${attempt} failed:`, error);
        if (attempt < config.retryAttempts) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
    }
    throw new Error(`Failed to fetch cookies after ${config.retryAttempts} attempts. Last error: ${lastError.message}`);
  }
  function prepareCookie(cookie, url) {
    const newCookie = {
      name: cookie.name || '',
      value: cookie.value || '',
      url: url,
      path: cookie.path || '/',
      secure: cookie.secure || false,
      httpOnly: cookie.httpOnly || false,
      expirationDate: cookie.expirationDate || null
    };
    if (cookie.hostOnly) {
      newCookie.domain = null;
    } else if (cookie.domain) {
      newCookie.domain = cookie.domain;
    }
    let sameSite = cookie.sameSite;
    if (sameSite) {
      const sameSiteLower = sameSite.toLowerCase();
      if (sameSiteLower === 'no_restriction' || sameSiteLower === 'none') {
        sameSite = 'none';
        newCookie.secure = true;
      } else if (sameSiteLower === 'lax') {
        sameSite = 'lax';
      } else if (sameSiteLower === 'strict') {
        sameSite = 'strict';
      } else {
        sameSite = 'no_restriction';
      }
    } else {
      sameSite = 'no_restriction';
    }
    newCookie.sameSite = sameSite;
    if (cookie.session) {
      newCookie.expirationDate = null;
    }
    return newCookie;
  }
  function saveCookie(cookie, url) {
    const preparedCookie = prepareCookie(cookie, url);
    const gmAvailable = typeof GM_cookie !== 'undefined' && GM_cookie && typeof GM_cookie.set === 'function';
    if (gmAvailable) {
      return new Promise((resolve, reject) => {
        GM_cookie.set(preparedCookie, (result, error) => {
          if (error) {
            console.error('Failed to save cookie:', error);
            reject(error);
          } else {
            resolve(result);
          }
        });
      });
    }
    return new Promise(resolve => {
      let cookieStr = `${preparedCookie.name}=${encodeURIComponent(preparedCookie.value)}`;
      cookieStr += `; path=${preparedCookie.path}`;
      if (preparedCookie.domain && !cookie.hostOnly) {
        cookieStr += `; domain=${preparedCookie.domain}`;
      }
      if (preparedCookie.secure) {
        cookieStr += '; Secure';
      }
      if (preparedCookie.sameSite) {
        const s = preparedCookie.sameSite.toLowerCase();
        if (s === 'lax' || s === 'strict' || s === 'none') {
          cookieStr += `; SameSite=${s.charAt(0).toUpperCase() + s.slice(1)}`;
          if (s === 'none') {
            cookieStr += '; Secure';
          }
        }
      }
      if (preparedCookie.expirationDate) {
        const d = new Date(0);
        d.setUTCSeconds(preparedCookie.expirationDate);
        cookieStr += `; Expires=${d.toUTCString()}`;
      }
      document.cookie = cookieStr;
      console.warn('GM_cookie not available, used document.cookie fallback.');
      resolve(true);
    });
  }
  async function removeCookie(name, url, cookie) {
    const gmAvailable = typeof GM_cookie !== 'undefined' && GM_cookie && typeof GM_cookie.delete === 'function';
    if (gmAvailable) {
      if (cookie && cookie.domain) {
        const domains = [cookie.domain, '.' + cookie.domain.replace(/^\./, ''), cookie.domain.replace(/^\./, '')];
        for (const domain of domains) {
          try {
            await new Promise(resolve => {
              GM_cookie.delete({
                name: name,
                url: url,
                domain: domain
              }, (result, error) => {
                if (!error) {}
                resolve(!error);
              });
            });
          } catch {
          }
        }
      }
      return new Promise(resolve => {
        GM_cookie.delete({
          name: name,
          url: url
        }, (result, error) => {
          if (!error) {}
          resolve(!error);
        });
      });
    }
    return new Promise(resolve => {
      const paths = ['/', (cookie === null || cookie === void 0 ? void 0 : cookie.path) || '/'];
      paths.forEach(path => {
        document.cookie = `${name}=; path=${path}; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
        if (cookie !== null && cookie !== void 0 && cookie.domain) {
          document.cookie = `${name}=; domain=${cookie.domain}; path=${path}; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
        }
      });
      resolve(true);
    });
  }
  function getAllCookies(url) {
    const gmAvailable = typeof GM_cookie !== 'undefined' && GM_cookie && typeof GM_cookie.list === 'function';
    if (gmAvailable) {
      return new Promise((resolve, reject) => {
        GM_cookie.list({
          url: url
        }, (cookies, error) => {
          if (error) {
            console.error('Failed to get cookies:', error);
            reject(error);
          } else {
            resolve(cookies);
          }
        });
      });
    }
    return new Promise(resolve => {
      const cookieStr = document.cookie || '';
      const pairs = cookieStr ? cookieStr.split('; ') : [];
      const results = pairs.map(p => {
        const eqIdx = p.indexOf('=');
        const name = eqIdx >= 0 ? p.slice(0, eqIdx) : p;
        const value = eqIdx >= 0 ? decodeURIComponent(p.slice(eqIdx + 1)) : '';
        return {
          name,
          value
        };
      });
      resolve(results);
    });
  }
  async function updateCookiesFromWorker(silentMode = false) {
    if (!silentMode) {
      showNotification('Starting cookie update...', 'info');
    }
    try {
      const newCookies = await fetchCookiesFromWorker();
      if (!newCookies || !Array.isArray(newCookies) || newCookies.length === 0) {
        if (!silentMode) {
          showNotification('No cookies were fetched from worker.', 'warning');
        }
        return {
          success: false,
          message: 'No cookies fetched'
        };
      }
      const currentUrl = window.location.href;
      const existingCookies = await getAllCookies(currentUrl);
      let removedCount = 0;
      let successCount = 0;
      let errorCount = 0;
      if (!silentMode) {
        showNotification(`Removing ${existingCookies.length} existing cookies...`, 'info');
      }
      for (const existingCookie of existingCookies) {
        try {
          await removeCookie(existingCookie.name, currentUrl, existingCookie);
          removedCount++;
        } catch (error) {
          console.error(`Failed to remove cookie ${existingCookie.name}:`, error);
        }
      }
      await new Promise(resolve => setTimeout(resolve, 200));
      if (!silentMode) {
        showNotification(`Adding ${newCookies.length} new cookies...`, 'info');
      }
      for (const cookie of newCookies) {
        try {
          await saveCookie(cookie, currentUrl);
          successCount++;
        } catch (error) {
          errorCount++;
          console.error(`Failed to process cookie ${cookie.name}:`, error);
        }
      }
      if (!silentMode) {
        const message = `Removed ${removedCount} old cookies, added ${successCount} new cookies${errorCount > 0 ? `, ${errorCount} failed` : ''}`;
        showNotification(message, errorCount > 0 ? 'error' : 'success');
      }
      if (successCount > 0) {
        setTimeout(() => {
          window.location.reload();
        }, 1000);
      }
      return {
        success: true,
        stats: {
          total: newCookies.length,
          success: successCount,
          error: errorCount
        }
      };
    } catch (error) {
      console.error('Error updating cookies:', error);
      if (!silentMode) {
        showNotification('Failed to update cookies: ' + error.message, 'error');
      }
      return {
        success: false,
        error: error.message
      };
    }
  }

  function getCurrentCourseInfo() {
    const url = window.location.href;
    let courseId = null;
    let courseTitle = null;
    let courseImage = null;
    const courseUrl = url;
    let instructor = null;
    const courseMatch = url.match(/\/course\/([^/?]+)/);
    if (courseMatch) {
      courseId = courseMatch[1];
    }
    const titleEl = document.querySelector('[data-purpose="course-title"], h1.ud-heading-xl, h1.clp-lead__title, .ud-heading-xxl');
    if (titleEl) {
      courseTitle = titleEl.textContent.trim();
    }

    const imgSelectors = ['[data-purpose="course-image"] img', '.intro-asset--img-aspect--1UbeZ img', '.course-image img', 'img[src*="img-c.udemycdn.com/course"]', 'img[src*="udemycdn.com/course"]'];
    for (const selector of imgSelectors) {
      const imgEl = document.querySelector(selector);
      if (imgEl && imgEl.src) {
        courseImage = imgEl.src;
        break;
      }
    }

    if (!courseImage) {
      const allImages = document.querySelectorAll('img[src*="udemycdn.com"]');
      for (const img of allImages) {
        if (img.src.includes('/course/') && !img.src.includes('icon') && !img.src.includes('avatar')) {
          courseImage = img.src;
          break;
        }
      }
    }
    const instructorEl = document.querySelector('[data-purpose="instructor-name-top"], .ud-instructor-links a, .instructor-links a');
    if (instructorEl) {
      instructor = instructorEl.textContent.trim();
    }
    if (!courseTitle) {
      courseTitle = document.title.replace(' | Udemy Business', '').replace(' | Udemy', '').trim();
    }
    return {
      id: courseId || btoa(url).slice(0, 20),
      title: courseTitle || 'Unknown Course',
      image: courseImage,
      url: courseUrl,
      instructor: instructor,
      addedAt: Date.now()
    };
  }

  function injectStyles() {
    if (document.getElementById('udemy-combined-styles')) return;
    const styles = document.createElement('style');
    styles.id = 'udemy-combined-styles';
    styles.textContent = `
            @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap');

            #udemy-cookie-notification {
                position: fixed;
                top: 20px;
                right: 20px;
                padding: 15px 20px;
                border-radius: 10px;
                color: white;
                font-family: 'Plus Jakarta Sans', Arial, sans-serif;
                font-size: 14px;
                z-index: 100002;
                max-width: 300px;
                word-wrap: break-word;
                box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
                transition: opacity 0.3s ease;
            }

            #udemy-combined-controls {
                position: fixed;
                bottom: 20px;
                right: 20px;
                display: flex;
                flex-direction: column;
                gap: 10px;
                z-index: 99990;
                font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
            }

            .ucc-btn {
                padding: 12px 16px;
                border: none;
                border-radius: 12px;
                cursor: pointer;
                font-size: 13px;
                font-weight: 600;
                display: flex;
                align-items: center;
                gap: 8px;
                transition: all 0.2s ease;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
                font-family: inherit;
            }

            .ucc-btn:hover {
                transform: translateY(-2px);
                box-shadow: 0 8px 20px rgba(0, 0, 0, 0.3);
            }

            .ucc-btn:disabled {
                opacity: 0.6;
                cursor: not-allowed;
                transform: none;
            }

            .ucc-btn.primary { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; }
            .ucc-btn.secondary { background: #1f2937; color: white; }
            .ucc-btn.success { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; }
            .ucc-btn svg { width: 18px; height: 18px; }

            .ufo-overlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.7);
                backdrop-filter: blur(8px);
                z-index: 99998;
                opacity: 0;
                transition: opacity 0.3s ease;
            }

            .ufo-overlay.visible { opacity: 1; }

            .ufo-popup {
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%) scale(0.9);
                width: 900px;
                max-width: 95vw;
                height: 650px;
                max-height: 90vh;
                background: linear-gradient(145deg, #1a1a2e 0%, #16213e 100%);
                border-radius: 20px;
                box-shadow: 0 25px 80px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.1);
                z-index: 99999;
                font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
                display: flex;
                flex-direction: column;
                overflow: hidden;
                opacity: 0;
                transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            }

            .ufo-popup.visible { opacity: 1; transform: translate(-50%, -50%) scale(1); }

            .ufo-header {
                padding: 20px 24px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                display: flex;
                justify-content: space-between;
                align-items: center;
            }

            .ufo-header h2 {
                margin: 0;
                font-size: 20px;
                font-weight: 700;
                color: white;
                display: flex;
                align-items: center;
                gap: 10px;
            }

            .ufo-header-icon {
                width: 28px;
                height: 28px;
                background: rgba(255, 255, 255, 0.2);
                border-radius: 8px;
                display: flex;
                align-items: center;
                justify-content: center;
            }

            .ufo-header-right { display: flex; align-items: center; gap: 12px; }
            .ufo-user-info { font-size: 12px; color: rgba(255, 255, 255, 0.8); text-align: right; }
            .ufo-user-info span { display: block; }

            .ufo-sync-btn {
                padding: 8px 12px;
                background: rgba(255, 255, 255, 0.15);
                border: none;
                border-radius: 8px;
                color: white;
                cursor: pointer;
                display: flex;
                align-items: center;
                gap: 6px;
                font-size: 12px;
                transition: all 0.2s ease;
            }

            .ufo-sync-btn:hover { background: rgba(255, 255, 255, 0.25); }
            .ufo-sync-btn.syncing svg { animation: spin 1s linear infinite; }
            @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

            .ufo-close-btn {
                width: 36px;
                height: 36px;
                border: none;
                background: rgba(255, 255, 255, 0.15);
                color: white;
                border-radius: 10px;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.2s ease;
            }

            .ufo-close-btn:hover { background: rgba(255, 255, 255, 0.25); transform: rotate(90deg); }

            .ufo-body { display: flex; flex: 1; overflow: hidden; min-height: 0; }

            .ufo-sidebar {
                width: 280px;
                background: rgba(0, 0, 0, 0.2);
                border-right: 1px solid rgba(255, 255, 255, 0.08);
                display: flex;
                flex-direction: column;
            }

            .ufo-sidebar-header { padding: 16px; border-bottom: 1px solid rgba(255, 255, 255, 0.08); }

            .ufo-new-folder-btn {
                width: 100%;
                padding: 12px 16px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                border: none;
                border-radius: 10px;
                font-size: 14px;
                font-weight: 600;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
                transition: all 0.2s ease;
                font-family: inherit;
            }

            .ufo-new-folder-btn:hover { transform: translateY(-2px); box-shadow: 0 8px 20px rgba(102, 126, 234, 0.4); }

            .ufo-folder-list { flex: 1; overflow-y: auto; padding: 12px; }

            .ufo-folder-item {
                padding: 12px 14px;
                border-radius: 10px;
                cursor: pointer;
                display: flex;
                align-items: center;
                gap: 12px;
                margin-bottom: 6px;
                transition: all 0.2s ease;
                position: relative;
            }

            .ufo-folder-item:hover { background: rgba(255, 255, 255, 0.08); }
            .ufo-folder-item.active { background: rgba(102, 126, 234, 0.2); }

            .ufo-folder-icon {
                width: 36px;
                height: 36px;
                border-radius: 8px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 18px;
                flex-shrink: 0;
            }

            .ufo-folder-info { flex: 1; min-width: 0; }
            .ufo-folder-name { color: #fff; font-size: 14px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            .ufo-folder-count { color: rgba(255, 255, 255, 0.5); font-size: 12px; margin-top: 2px; }

            .ufo-folder-menu-btn {
                width: 28px;
                height: 28px;
                border: none;
                background: transparent;
                color: rgba(255, 255, 255, 0.4);
                border-radius: 6px;
                cursor: pointer;
                opacity: 0;
                transition: all 0.2s ease;
                display: flex;
                align-items: center;
                justify-content: center;
            }

            .ufo-folder-item:hover .ufo-folder-menu-btn { opacity: 1; }
            .ufo-folder-menu-btn:hover { background: rgba(255, 255, 255, 0.1); color: white; }

            .ufo-content { flex: 1; display: flex; flex-direction: column; overflow: hidden; min-height: 0; }

            .ufo-content-header {
                padding: 20px 24px;
                border-bottom: 1px solid rgba(255, 255, 255, 0.08);
                display: flex;
                justify-content: space-between;
                align-items: center;
            }

            .ufo-content-title { color: white; font-size: 18px; font-weight: 700; display: flex; align-items: center; gap: 10px; }
            .ufo-search-box { position: relative; }

            .ufo-search-input {
                width: 220px;
                padding: 10px 14px 10px 38px;
                background: rgba(255, 255, 255, 0.08);
                border: 1px solid rgba(255, 255, 255, 0.12);
                border-radius: 10px;
                color: white;
                font-size: 13px;
                font-family: inherit;
                transition: all 0.2s ease;
            }

            .ufo-search-input::placeholder { color: rgba(255, 255, 255, 0.4); }
            .ufo-search-input:focus { outline: none; background: rgba(255, 255, 255, 0.12); border-color: rgba(102, 126, 234, 0.5); }
            .ufo-search-icon { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: rgba(255, 255, 255, 0.4); }

            .ufo-course-grid {
                flex: 1;
                overflow-y: auto;
                padding: 20px 24px;
                display: grid;
                grid-template-columns: repeat(2, 1fr);
                grid-auto-rows: min-content;
                gap: 16px;
                min-height: 0;
                align-content: start;
            }
            
            .ufo-pagination {
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 16px;
                padding: 16px 24px;
                border-top: 1px solid rgba(255, 255, 255, 0.08);
                background: rgba(0, 0, 0, 0.2);
            }
            
            .ufo-pagination-btn {
                padding: 10px 20px;
                background: rgba(255, 255, 255, 0.1);
                border: 1px solid rgba(255, 255, 255, 0.15);
                border-radius: 8px;
                color: white;
                font-size: 13px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s ease;
                font-family: inherit;
                display: flex;
                align-items: center;
                gap: 6px;
            }
            
            .ufo-pagination-btn:hover:not(:disabled) {
                background: rgba(255, 255, 255, 0.2);
                transform: translateY(-1px);
            }
            
            .ufo-pagination-btn:disabled {
                opacity: 0.4;
                cursor: not-allowed;
            }
            
            .ufo-pagination-info {
                color: rgba(255, 255, 255, 0.7);
                font-size: 13px;
                min-width: 100px;
                text-align: center;
            }

            .ufo-course-card {
                background: rgba(255, 255, 255, 0.05);
                border-radius: 12px;
                overflow: hidden;
                transition: all 0.2s ease;
                border: 1px solid rgba(255, 255, 255, 0.08);
                display: flex;
                flex-direction: column;
                height: auto;
            }

            .ufo-course-card:hover { transform: translateY(-2px); background: rgba(255, 255, 255, 0.08); box-shadow: 0 8px 20px rgba(0, 0, 0, 0.3); }
            
            .ufo-course-image-link {
                display: block;
                cursor: pointer;
                flex-shrink: 0;
            }
            
            .ufo-course-image { 
                width: 100%; 
                height: 120px; 
                object-fit: cover; 
                background: rgba(255, 255, 255, 0.1);
                display: block;
            }
            
            .ufo-course-info { 
                padding: 12px; 
                display: flex; 
                flex-direction: column; 
                gap: 8px;
            }

            .ufo-course-title {
                color: white;
                font-size: 13px;
                font-weight: 600;
                line-height: 1.3;
                display: -webkit-box;
                -webkit-line-clamp: 2;
                -webkit-box-orient: vertical;
                overflow: hidden;
            }

            .ufo-course-instructor { 
                color: rgba(255, 255, 255, 0.5); 
                font-size: 11px; 
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            
            .ufo-course-actions { 
                display: flex; 
                gap: 6px; 
                margin-top: auto;
            }

            .ufo-course-btn {
                padding: 4px 10px;
                border: none;
                border-radius: 4px;
                font-size: 10px;
                font-weight: 500;
                cursor: pointer;
                transition: all 0.2s ease;
                font-family: inherit;
            }

            .ufo-course-btn.primary { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; }
            .ufo-course-btn.primary:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4); }
            .ufo-course-btn.danger { background: rgba(239, 68, 68, 0.2); color: #f87171; }
            .ufo-course-btn.danger:hover { background: rgba(239, 68, 68, 0.3); }

            .ufo-empty-state {
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                height: 100%;
                color: rgba(255, 255, 255, 0.5);
                text-align: center;
                padding: 40px;
            }

            .ufo-empty-icon { font-size: 64px; margin-bottom: 16px; opacity: 0.5; }
            .ufo-empty-text { font-size: 16px; margin-bottom: 8px; }
            .ufo-empty-hint { font-size: 13px; opacity: 0.7; }

            .ufo-loading {
                display: flex;
                align-items: center;
                justify-content: center;
                height: 100%;
                color: rgba(255, 255, 255, 0.5);
            }

            .ufo-loading-spinner {
                width: 40px;
                height: 40px;
                border: 3px solid rgba(255, 255, 255, 0.1);
                border-top-color: #667eea;
                border-radius: 50%;
                animation: spin 1s linear infinite;
            }

            .ufo-modal {
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%) scale(0.9);
                background: linear-gradient(145deg, #1a1a2e 0%, #16213e 100%);
                padding: 24px;
                border-radius: 16px;
                box-shadow: 0 25px 80px rgba(0, 0, 0, 0.5);
                z-index: 100000;
                min-width: 360px;
                max-width: 90vw;
                opacity: 0;
                transition: all 0.3s ease;
                font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
            }

            .ufo-modal.visible { opacity: 1; transform: translate(-50%, -50%) scale(1); }
            .ufo-modal-title { color: white; font-size: 18px; font-weight: 700; margin: 0 0 20px 0; }

            .ufo-modal-input {
                width: 100%;
                padding: 12px 16px;
                background: rgba(255, 255, 255, 0.08);
                border: 1px solid rgba(255, 255, 255, 0.12);
                border-radius: 10px;
                color: white;
                font-size: 14px;
                font-family: inherit;
                margin-bottom: 16px;
                box-sizing: border-box;
            }

            .ufo-modal-input:focus { outline: none; border-color: rgba(102, 126, 234, 0.5); }
            .ufo-color-picker { display: flex; gap: 8px; margin-bottom: 20px; }

            .ufo-color-option {
                width: 32px;
                height: 32px;
                border-radius: 8px;
                cursor: pointer;
                border: 2px solid transparent;
                transition: all 0.2s ease;
            }

            .ufo-color-option:hover { transform: scale(1.1); }
            .ufo-color-option.selected { border-color: white; box-shadow: 0 0 12px rgba(255, 255, 255, 0.3); }

            .ufo-modal-actions { display: flex; gap: 10px; justify-content: flex-end; }

            .ufo-modal-btn {
                padding: 10px 20px;
                border: none;
                border-radius: 8px;
                font-size: 14px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s ease;
                font-family: inherit;
            }

            .ufo-modal-btn.primary { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; }
            .ufo-modal-btn.cancel { background: rgba(255, 255, 255, 0.1); color: rgba(255, 255, 255, 0.7); }
            .ufo-modal-btn:hover { transform: translateY(-2px); }
            .ufo-modal-btn:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }

            .ufo-dropdown {
                position: absolute;
                background: #1e1e2e;
                border-radius: 10px;
                box-shadow: 0 10px 40px rgba(0, 0, 0, 0.4);
                z-index: 100001;
                min-width: 160px;
                overflow: hidden;
                border: 1px solid rgba(255, 255, 255, 0.1);
            }

            .ufo-dropdown-item {
                padding: 12px 16px;
                color: rgba(255, 255, 255, 0.8);
                font-size: 13px;
                cursor: pointer;
                display: flex;
                align-items: center;
                gap: 10px;
                transition: all 0.2s ease;
            }

            .ufo-dropdown-item:hover { background: rgba(255, 255, 255, 0.1); color: white; }
            .ufo-dropdown-item.danger { color: #f87171; }
            .ufo-dropdown-item.danger:hover { background: rgba(239, 68, 68, 0.2); }

            .ufo-folder-select { margin-bottom: 20px; }
            .ufo-folder-select-label { color: rgba(255, 255, 255, 0.7); font-size: 13px; margin-bottom: 8px; display: block; }
            .ufo-folder-select-options { display: flex; flex-wrap: wrap; gap: 8px; }

            .ufo-folder-select-option {
                padding: 8px 14px;
                background: rgba(255, 255, 255, 0.08);
                border: 1px solid rgba(255, 255, 255, 0.12);
                border-radius: 8px;
                color: rgba(255, 255, 255, 0.8);
                font-size: 13px;
                cursor: pointer;
                transition: all 0.2s ease;
            }

            .ufo-folder-select-option:hover { background: rgba(255, 255, 255, 0.12); }
            .ufo-folder-select-option.selected { background: rgba(102, 126, 234, 0.3); border-color: rgba(102, 126, 234, 0.5); color: white; }

            .ufo-settings-section { margin-bottom: 20px; }
            .ufo-settings-section-title { color: rgba(255, 255, 255, 0.5); font-size: 11px; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 12px; }

            .ufo-settings-row {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 12px 0;
                border-bottom: 1px solid rgba(255, 255, 255, 0.08);
            }

            .ufo-settings-row:last-child { border-bottom: none; }
            .ufo-settings-label { color: white; font-size: 14px; }
            .ufo-settings-hint { color: rgba(255, 255, 255, 0.5); font-size: 12px; margin-top: 4px; }

            .ufo-toggle {
                position: relative;
                width: 44px;
                height: 24px;
                background: rgba(255, 255, 255, 0.2);
                border-radius: 12px;
                cursor: pointer;
                transition: all 0.2s ease;
            }

            .ufo-toggle.active { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }

            .ufo-toggle::after {
                content: '';
                position: absolute;
                top: 2px;
                left: 2px;
                width: 20px;
                height: 20px;
                background: white;
                border-radius: 50%;
                transition: all 0.2s ease;
            }

            .ufo-toggle.active::after { left: 22px; }

            .ufo-scrollbar::-webkit-scrollbar { width: 8px; }
            .ufo-scrollbar::-webkit-scrollbar-track { background: transparent; }
            .ufo-scrollbar::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.2); border-radius: 4px; }
            .ufo-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, 0.3); }
        `;
    document.head.appendChild(styles);
  }

  const ICONS = {
    folder: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>`,
    plus: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`,
    close: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`,
    search: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.35-4.35"></path></svg>`,
    more: `<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="6" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="18" r="2"/></svg>`,
    edit: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>`,
    trash: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`,
    external: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>`,
    bookmark: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z"/></svg>`,
    settings: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>`,
    emptyFolder: `📂`,
    refresh: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>`,
    cloud: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"></path></svg>`
  };

  function showNotification(message, type = 'info') {
    const existingNotification = document.getElementById('udemy-cookie-notification');
    if (existingNotification) existingNotification.remove();
    const notification = document.createElement('div');
    notification.id = 'udemy-cookie-notification';
    let bgColor;
    switch (type) {
      case 'success':
        bgColor = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
        break;
      case 'error':
        bgColor = 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)';
        break;
      case 'warning':
        bgColor = 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)';
        break;
      default:
        bgColor = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
    }
    notification.style.background = bgColor;
    notification.textContent = message;
    document.body.appendChild(notification);
    setTimeout(() => {
      if (notification.parentNode) {
        notification.style.opacity = '0';
        setTimeout(() => notification.parentNode && notification.remove(), 300);
      }
    }, 3000);
  }

  function showDropdown(anchor, items) {
    closeAllDropdowns();
    const rect = anchor.getBoundingClientRect();
    const dropdown = document.createElement('div');
    dropdown.className = 'ufo-dropdown';
    dropdown.style.top = `${rect.bottom + 4}px`;
    dropdown.style.left = `${rect.left}px`;
    items.forEach(item => {
      const el = document.createElement('div');
      el.className = `ufo-dropdown-item ${item.danger ? 'danger' : ''}`;
      el.innerHTML = `${item.icon || ''} ${item.label}`;
      el.addEventListener('click', e => {
        e.stopPropagation();
        closeAllDropdowns();
        item.onClick();
      });
      dropdown.appendChild(el);
    });
    document.body.appendChild(dropdown);
    setTimeout(() => document.addEventListener('click', closeAllDropdowns, {
      once: true
    }), 0);
  }
  function closeAllDropdowns() {
    document.querySelectorAll('.ufo-dropdown').forEach(d => d.remove());
  }

  function showCreateFolderModal(callback) {
    const colors = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ef4444', '#06b6d4'];
    let selectedColor = colors[0];
    const overlay = document.createElement('div');
    overlay.className = 'ufo-overlay';
    overlay.addEventListener('click', () => closeModal());
    const modal = document.createElement('div');
    modal.className = 'ufo-modal';
    modal.innerHTML = `
            <h3 class="ufo-modal-title">Create New Folder</h3>
            <input type="text" class="ufo-modal-input" placeholder="Folder name" autofocus>
            <div class="ufo-color-picker">
                ${colors.map((c, i) => `<div class="ufo-color-option ${i === 0 ? 'selected' : ''}" data-color="${c}" style="background: ${c}"></div>`).join('')}
            </div>
            <div class="ufo-modal-actions">
                <button class="ufo-modal-btn cancel">Cancel</button>
                <button class="ufo-modal-btn primary">Create</button>
            </div>
        `;
    document.body.appendChild(overlay);
    document.body.appendChild(modal);
    setTimeout(() => {
      overlay.classList.add('visible');
      modal.classList.add('visible');
      modal.querySelector('input').focus();
    }, 10);
    modal.querySelectorAll('.ufo-color-option').forEach(opt => {
      opt.addEventListener('click', () => {
        modal.querySelectorAll('.ufo-color-option').forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected');
        selectedColor = opt.dataset.color;
      });
    });
    const closeModal = () => {
      overlay.classList.remove('visible');
      modal.classList.remove('visible');
      setTimeout(() => {
        overlay.remove();
        modal.remove();
      }, 300);
    };
    modal.querySelector('.cancel').addEventListener('click', closeModal);
    modal.querySelector('.primary').addEventListener('click', async () => {
      const name = modal.querySelector('input').value.trim();
      if (name) {
        modal.querySelector('.primary').disabled = true;
        modal.querySelector('.primary').textContent = 'Creating...';
        await callback(name, selectedColor);
        closeModal();
      }
    });
    modal.querySelector('input').addEventListener('keydown', async e => {
      if (e.key === 'Enter') {
        const name = modal.querySelector('input').value.trim();
        if (name) {
          modal.querySelector('.primary').disabled = true;
          await callback(name, selectedColor);
          closeModal();
        }
      } else if (e.key === 'Escape') {
        closeModal();
      }
    });
  }
  function showRenameFolderModal(currentName, folderId, callback) {
    const overlay = document.createElement('div');
    overlay.className = 'ufo-overlay';
    overlay.addEventListener('click', () => closeModal());
    const modal = document.createElement('div');
    modal.className = 'ufo-modal';
    modal.innerHTML = `
            <h3 class="ufo-modal-title">Rename Folder</h3>
            <input type="text" class="ufo-modal-input" value="${currentName}" autofocus>
            <div class="ufo-modal-actions">
                <button class="ufo-modal-btn cancel">Cancel</button>
                <button class="ufo-modal-btn primary">Rename</button>
            </div>
        `;
    document.body.appendChild(overlay);
    document.body.appendChild(modal);
    setTimeout(() => {
      overlay.classList.add('visible');
      modal.classList.add('visible');
      modal.querySelector('input').select();
    }, 10);
    const closeModal = () => {
      overlay.classList.remove('visible');
      modal.classList.remove('visible');
      setTimeout(() => {
        overlay.remove();
        modal.remove();
      }, 300);
    };
    modal.querySelector('.cancel').addEventListener('click', closeModal);
    modal.querySelector('.primary').addEventListener('click', async () => {
      const name = modal.querySelector('input').value.trim();
      if (name && name !== currentName) {
        modal.querySelector('.primary').disabled = true;
        modal.querySelector('.primary').textContent = 'Renaming...';
        await callback(name, folderId);
        closeModal();
      }
    });
    modal.querySelector('input').addEventListener('keydown', async e => {
      if (e.key === 'Enter') {
        const name = modal.querySelector('input').value.trim();
        if (name && name !== currentName) {
          modal.querySelector('.primary').disabled = true;
          await callback(name, folderId);
          closeModal();
        }
      } else if (e.key === 'Escape') {
        closeModal();
      }
    });
  }
  function showAddCourseModal(courseInfo) {
    const overlay = document.createElement('div');
    overlay.className = 'ufo-overlay';
    overlay.addEventListener('click', () => closeModal());
    const selectedFolderIds = new Set();
    const modal = document.createElement('div');
    modal.className = 'ufo-modal';
    modal.innerHTML = `
            <h3 class="ufo-modal-title">Save Course to Folder</h3>
            <div style="background: rgba(255,255,255,0.05); border-radius: 10px; padding: 12px; margin-bottom: 16px; display: flex; gap: 12px; align-items: center;">
                ${courseInfo.image ? `<img src="${courseInfo.image}" style="width: 80px; height: 45px; border-radius: 6px; object-fit: cover;">` : ''}
                <div style="flex: 1; min-width: 0;">
                    <div style="color: white; font-size: 14px; font-weight: 600; line-height: 1.3; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${courseInfo.title}</div>
                    ${courseInfo.instructor ? `<div style="color: rgba(255,255,255,0.5); font-size: 12px; margin-top: 4px;">${courseInfo.instructor}</div>` : ''}
                </div>
            </div>
            <div class="ufo-folder-select">
                <label class="ufo-folder-select-label">Select folders:</label>
                <div class="ufo-folder-select-options">
                    ${folders.map(f => `
                        <div class="ufo-folder-select-option" data-folder-id="${f.id}">
                            <span style="display: inline-block; width: 10px; height: 10px; border-radius: 3px; background: ${f.color}; margin-right: 6px;"></span>
                            ${f.name}
                        </div>
                    `).join('')}
                </div>
            </div>
            <div class="ufo-modal-actions">
                <button class="ufo-modal-btn cancel">Cancel</button>
                <button class="ufo-modal-btn primary">Save</button>
            </div>
        `;
    document.body.appendChild(overlay);
    document.body.appendChild(modal);
    setTimeout(() => {
      overlay.classList.add('visible');
      modal.classList.add('visible');
    }, 10);
    modal.querySelectorAll('.ufo-folder-select-option').forEach(opt => {
      opt.addEventListener('click', () => {
        const folderId = parseInt(opt.dataset.folderId);
        if (selectedFolderIds.has(folderId)) {
          selectedFolderIds.delete(folderId);
          opt.classList.remove('selected');
        } else {
          selectedFolderIds.add(folderId);
          opt.classList.add('selected');
        }
      });
    });
    const closeModal = () => {
      overlay.classList.remove('visible');
      modal.classList.remove('visible');
      setTimeout(() => {
        overlay.remove();
        modal.remove();
      }, 300);
    };
    modal.querySelector('.cancel').addEventListener('click', closeModal);
    modal.querySelector('.primary').addEventListener('click', async () => {
      if (selectedFolderIds.size > 0) {
        modal.querySelector('.primary').disabled = true;
        modal.querySelector('.primary').textContent = 'Saving...';
        try {
          await addCourseToFoldersAPI(Array.from(selectedFolderIds), courseInfo);
          closeModal();
          showNotification(`Course saved to ${selectedFolderIds.size} folder(s)!`, 'success');
        } catch (error) {
          showNotification('Failed to save course: ' + error.message, 'error');
          modal.querySelector('.primary').disabled = false;
          modal.querySelector('.primary').textContent = 'Save';
        }
      }
    });
  }
  function showSettingsModal() {
    const overlay = document.createElement('div');
    overlay.className = 'ufo-overlay';
    overlay.addEventListener('click', () => closeModal());
    const userInfo = getUserInfo();
    const modal = document.createElement('div');
    modal.className = 'ufo-modal';
    modal.style.minWidth = '450px';
    modal.innerHTML = `            
            <div class="ufo-settings-section">
                <div class="ufo-settings-section-title">Account</div>
                <div class="ufo-settings-row">
                    <div>
                        <div class="ufo-settings-label">License Key</div>
                        <div class="ufo-settings-hint">${userInfo.licenseKey}</div>
                    </div>
                </div>
                <div class="ufo-settings-row">
                    <div>
                        <div class="ufo-settings-label">Device ID</div>
                        <div class="ufo-settings-hint">${userInfo.deviceId}</div>
                    </div>
                </div>
                <div class="ufo-settings-row">
                    <div>
                        <div class="ufo-settings-label">Cloud Sync</div>
                        <div class="ufo-settings-hint">${config.licenseKey ? 'Enabled' : 'Disabled (set license key)'}</div>
                    </div>
                </div>
            </div>

            <div class="ufo-settings-section">
                <div class="ufo-settings-section-title">Configuration</div>
                <div style="margin-bottom: 12px;">
                    <label style="color: rgba(255,255,255,0.7); font-size: 12px; display: block; margin-bottom: 6px;">License Key</label>
                    <input type="text" class="ufo-modal-input" id="settings-license-key" value="${config.licenseKey}" style="margin-bottom: 0;">
                </div>
            </div>

            <div class="ufo-settings-section">
                <div class="ufo-settings-section-title">Display</div>
                <div class="ufo-settings-row">
                    <div class="ufo-settings-label">Show UI Buttons</div>
                    <div class="ufo-toggle ${config.showUiButtons ? 'active' : ''}" data-setting="showUiButtons"></div>
                </div>
                <div class="ufo-settings-row">
                    <div class="ufo-settings-label">Show Folder Organizer</div>
                    <div class="ufo-toggle ${config.showFolderOrganizer ? 'active' : ''}" data-setting="showFolderOrganizer"></div>
                </div>
            </div>

            <div class="ufo-settings-section">
                <div class="ufo-settings-section-title">Statistics</div>
                <div class="ufo-settings-row">
                    <div class="ufo-settings-label">Total Folders</div>
                    <div style="color: rgba(255,255,255,0.7);">${userInfo.totalFolders}</div>
                </div>
                <div class="ufo-settings-row">
                    <div class="ufo-settings-label">Total Saved Courses</div>
                    <div style="color: rgba(255,255,255,0.7);">${userInfo.totalCourses}</div>
                </div>
            </div>

            <div class="ufo-modal-actions">
                <button class="ufo-modal-btn cancel">Cancel</button>
                <button class="ufo-modal-btn primary">Save Settings</button>
            </div>
        `;
    document.body.appendChild(overlay);
    document.body.appendChild(modal);
    setTimeout(() => {
      overlay.classList.add('visible');
      modal.classList.add('visible');
    }, 10);
    modal.querySelectorAll('.ufo-toggle').forEach(toggle => {
      toggle.addEventListener('click', () => toggle.classList.toggle('active'));
    });
    const closeModal = () => {
      overlay.classList.remove('visible');
      modal.classList.remove('visible');
      setTimeout(() => {
        overlay.remove();
        modal.remove();
      }, 300);
    };
    modal.querySelector('.cancel').addEventListener('click', closeModal);
    modal.querySelector('.primary').addEventListener('click', async () => {
      const oldLicenseKey = config.licenseKey;
      config.licenseKey = modal.querySelector('#settings-license-key').value;
      config.showUiButtons = modal.querySelector('[data-setting="showUiButtons"]').classList.contains('active');
      config.showFolderOrganizer = modal.querySelector('[data-setting="showFolderOrganizer"]').classList.contains('active');
      saveConfig();
      closeModal();
      showNotification('Settings saved!', 'success');
      renderFloatingControls();

      if (config.licenseKey && config.licenseKey !== oldLicenseKey) {
        await initDefaultFolders();
        await syncFoldersFromServer();
      }
    });
  }

  let currentFolderId = null;
  let searchQuery = '';
  let currentPage = 1;
  const ITEMS_PER_PAGE = 4;
  async function createMainPopup() {
    if (document.getElementById('ufo-popup')) return;
    const overlay = document.createElement('div');
    overlay.className = 'ufo-overlay';
    overlay.id = 'ufo-overlay';
    overlay.addEventListener('click', closeMainPopup);
    const popup = document.createElement('div');
    popup.className = 'ufo-popup';
    popup.id = 'ufo-popup';
    const userInfo = getUserInfo();
    popup.innerHTML = `
            <div class="ufo-header">
                <h2>
                    <div class="ufo-header-icon">${ICONS.bookmark}</div>
                    Course Folder Organizer
                </h2>
                <div class="ufo-header-right">
                    <div class="ufo-user-info">
                        <span>License: ${userInfo.licenseKey}</span>
                        <span>${userInfo.totalCourses} courses in ${userInfo.totalFolders} folders</span>
                    </div>
                    <button class="ufo-sync-btn" id="ufo-sync-btn" title="Sync with cloud">
                        ${ICONS.refresh} Sync
                    </button>
                    <button class="ufo-close-btn">${ICONS.close}</button>
                </div>
            </div>
            <div class="ufo-body">
                <div class="ufo-sidebar">
                    <div class="ufo-sidebar-header">
                        <button class="ufo-new-folder-btn">
                            ${ICONS.plus} New Folder
                        </button>
                    </div>
                    <div class="ufo-folder-list ufo-scrollbar" id="ufo-folder-list"></div>
                </div>
                <div class="ufo-content">
                    <div class="ufo-content-header">
                        <div class="ufo-content-title" id="ufo-content-title">
                            ${ICONS.folder} All Courses
                        </div>
                        <div class="ufo-search-box">
                            <span class="ufo-search-icon">${ICONS.search}</span>
                            <input type="text" class="ufo-search-input" placeholder="Search courses..." id="ufo-search">
                        </div>
                    </div>
                    <div class="ufo-course-grid" id="ufo-course-grid"></div>
                    <div class="ufo-pagination" id="ufo-pagination">
                        <button class="ufo-pagination-btn" id="ufo-prev-btn">← Previous</button>
                        <span class="ufo-pagination-info" id="ufo-page-info">Page 1 of 1</span>
                        <button class="ufo-pagination-btn" id="ufo-next-btn">Next →</button>
                    </div>
                </div>
            </div>
        `;
    document.body.appendChild(overlay);
    document.body.appendChild(popup);
    popup.querySelector('.ufo-close-btn').addEventListener('click', closeMainPopup);
    popup.querySelector('#ufo-sync-btn').addEventListener('click', async () => {
      const btn = popup.querySelector('#ufo-sync-btn');
      btn.classList.add('syncing');
      btn.disabled = true;
      await syncFoldersFromServer();
      renderFolderList();
      await renderCourseGrid();
      btn.classList.remove('syncing');
      btn.disabled = false;
      showNotification('Synced with cloud!', 'success');
    });
    popup.querySelector('.ufo-new-folder-btn').addEventListener('click', () => {
      showCreateFolderModal(async (name, color) => {
        try {
          await createFolderAPI(name, color);
          renderFolderList();
          showNotification(`Folder "${name}" created!`, 'success');
        } catch (error) {
          showNotification('Failed to create folder: ' + error.message, 'error');
        }
      });
    });
    popup.querySelector('#ufo-search').addEventListener('input', e => {
      searchQuery = e.target.value.toLowerCase();
      currentPage = 1; 
      renderCourseGrid();
    });
    popup.querySelector('#ufo-prev-btn').addEventListener('click', () => {
      if (currentPage > 1) {
        currentPage--;
        renderCourseGrid();
      }
    });
    popup.querySelector('#ufo-next-btn').addEventListener('click', () => {
      currentPage++;
      renderCourseGrid();
    });
    setTimeout(() => {
      overlay.classList.add('visible');
      popup.classList.add('visible');
    }, 10);
    currentFolderId = null;
    currentPage = 1; 
    renderFolderList();
    await renderCourseGrid();
    isOrganizerPopupOpen = true;
  }
  function closeMainPopup() {
    const overlay = document.getElementById('ufo-overlay');
    const popup = document.getElementById('ufo-popup');
    if (overlay) overlay.classList.remove('visible');
    if (popup) popup.classList.remove('visible');
    setTimeout(() => {
      overlay === null || overlay === void 0 || overlay.remove();
      popup === null || popup === void 0 || popup.remove();
    }, 300);
    isOrganizerPopupOpen = false;
  }
  function renderFolderList() {
    const container = document.getElementById('ufo-folder-list');
    if (!container) return;
    container.innerHTML = folders.map(folder => {
      var _folder$courses;
      return `
            <div class="ufo-folder-item ${currentFolderId === folder.id ? 'active' : ''}" data-folder-id="${folder.id}">
                <div class="ufo-folder-icon" style="background: ${folder.color}20; color: ${folder.color}">
                    ${ICONS.folder}
                </div>
                <div class="ufo-folder-info">
                    <div class="ufo-folder-name">${folder.name}</div>
                    <div class="ufo-folder-count">${((_folder$courses = folder.courses) === null || _folder$courses === void 0 ? void 0 : _folder$courses.length) || folder.course_count || 0} courses</div>
                </div>
                <button class="ufo-folder-menu-btn" data-folder-id="${folder.id}">${ICONS.more}</button>
            </div>
        `;
    }).join('');
    container.querySelectorAll('.ufo-folder-item').forEach(item => {
      item.addEventListener('click', async e => {
        if (e.target.closest('.ufo-folder-menu-btn')) return;
        currentFolderId = parseInt(item.dataset.folderId);
        currentPage = 1; 
        renderFolderList();
        await renderCourseGrid();
      });
    });
    container.querySelectorAll('.ufo-folder-menu-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const folderId = parseInt(btn.dataset.folderId);
        const folder = folders.find(f => f.id === folderId);
        showDropdown(btn, [{
          icon: ICONS.edit,
          label: 'Rename',
          onClick: () => {
            showRenameFolderModal(folder.name, folderId, async newName => {
              try {
                await updateFolderAPI(folderId, {
                  name: newName
                });
                renderFolderList();
                showNotification('Folder renamed!', 'success');
              } catch (error) {
                showNotification('Failed to rename: ' + error.message, 'error');
              }
            });
          }
        }, {
          icon: ICONS.trash,
          label: 'Delete',
          danger: true,
          onClick: async () => {
            if (confirm(`Delete folder "${folder.name}" and remove all courses from it?`)) {
              try {
                await deleteFolderAPI(folderId);
                if (currentFolderId === folderId) currentFolderId = null;
                renderFolderList();
                await renderCourseGrid();
                showNotification('Folder deleted!', 'success');
              } catch (error) {
                showNotification('Failed to delete: ' + error.message, 'error');
              }
            }
          }
        }]);
      });
    });
  }
  async function renderCourseGrid() {
    const container = document.getElementById('ufo-course-grid');
    const titleEl = document.getElementById('ufo-content-title');
    if (!container || !titleEl) return;
    let courses = [];
    let title = 'All Courses';
    if (currentFolderId) {
      const folder = folders.find(f => f.id === currentFolderId);
      if (folder) {
        title = folder.name;
        titleEl.innerHTML = `<span style="display: inline-block; width: 16px; height: 16px; border-radius: 4px; background: ${folder.color}; margin-right: 8px;"></span> ${title}`;

        if (!folder.courses || folder.courses.length === 0) {
          container.innerHTML = `<div class="ufo-loading" style="grid-column: 1 / -1;"><div class="ufo-loading-spinner"></div></div>`;
          courses = await loadCoursesForFolder(currentFolderId);
          folder.courses = courses;
        } else {
          courses = folder.courses;
        }
      }
    } else {
      titleEl.innerHTML = `${ICONS.folder} All Courses`;
      const seen = new Set();
      for (const folder of folders) {
        const folderCourses = folder.courses || [];
        for (const course of folderCourses) {
          const courseKey = course.udemy_course_id || course.course_id || course.id;
          if (!seen.has(courseKey)) {
            seen.add(courseKey);
            courses.push(course);
          }
        }
      }
    }

    if (searchQuery) {
      courses = courses.filter(c => c.title && c.title.toLowerCase().includes(searchQuery) || c.instructor && c.instructor.toLowerCase().includes(searchQuery));
    }

    const totalCourses = courses.length;
    const totalPages = Math.ceil(totalCourses / ITEMS_PER_PAGE);

    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;

    const paginationEl = document.getElementById('ufo-pagination');
    const prevBtn = document.getElementById('ufo-prev-btn');
    const nextBtn = document.getElementById('ufo-next-btn');
    const pageInfo = document.getElementById('ufo-page-info');
    if (paginationEl && prevBtn && nextBtn && pageInfo) {
      if (totalCourses === 0 || totalPages <= 1) {
        paginationEl.style.display = 'none';
      } else {
        paginationEl.style.display = 'flex';
        prevBtn.disabled = currentPage <= 1;
        nextBtn.disabled = currentPage >= totalPages;
        pageInfo.textContent = `Page ${currentPage} of ${totalPages} (${totalCourses} courses)`;
      }
    }
    if (courses.length === 0) {
      container.innerHTML = `
                <div class="ufo-empty-state" style="grid-column: 1 / -1;">
                    <div class="ufo-empty-icon">${ICONS.emptyFolder}</div>
                    <div class="ufo-empty-text">${searchQuery ? 'No courses found' : 'No courses yet'}</div>
                    <div class="ufo-empty-hint">${searchQuery ? 'Try a different search term' : 'Add courses from any Udemy course page'}</div>
                </div>
            `;
      return;
    }

    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    const pageCourses = courses.slice(startIndex, endIndex);

    const PLACEHOLDER_IMAGE = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA0ODAgMjcwIj48cmVjdCBmaWxsPSIjMWExYTJlIiB3aWR0aD0iNDgwIiBoZWlnaHQ9IjI3MCIvPjxwYXRoIGZpbGw9IiM2NjdlZWEiIGQ9Ik0yODAgMTAwSDIwMGMtNS41IDAtMTAgNC41LTEwIDEwdjgwYzAgNS41IDQuNSAxMCAxMCAxMGgxMjBjNS41IDAgMTAtNC41IDEwLTEwdi02MGMwLTUuNS00LjUtMTAtMTAtMTBoLTYwbC0xMC0yMGMtMi01LTctMTAtMTItMTBoLTM4eiIvPjwvc3ZnPg==';
    container.innerHTML = pageCourses.map(course => {
      const dbCourseId = course.course_id || course.id;
      const imageUrl = course.image_url || course.image || PLACEHOLDER_IMAGE;
      const courseUrl = course.url || '#';
      return `
                <div class="ufo-course-card" data-course-id="${dbCourseId}">
                    <a href="${courseUrl}" target="_blank" class="ufo-course-image-link" title="Open course">
                        <img class="ufo-course-image" src="${imageUrl}" alt="${course.title}" onerror="this.src='${PLACEHOLDER_IMAGE}'">
                    </a>
                    <div class="ufo-course-info">
                        <a href="${courseUrl}" target="_blank" class="ufo-course-title" style="text-decoration: none; cursor: pointer;">${course.title}</a>
                        ${course.instructor ? `<div class="ufo-course-instructor">${course.instructor}</div>` : ''}
                        <div class="ufo-course-actions">
                            <button class="ufo-course-btn primary" data-action="open" data-url="${courseUrl}">Open ${ICONS.external}</button>
                            <button class="ufo-course-btn danger" data-action="remove" data-course-id="${dbCourseId}" data-folder-id="${currentFolderId || ''}">Remove</button>
                        </div>
                    </div>
                </div>
            `;
    }).join('');
    container.querySelectorAll('[data-action="open"]').forEach(btn => {
      btn.addEventListener('click', () => window.open(btn.dataset.url, '_blank'));
    });
    container.querySelectorAll('[data-action="remove"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const courseId = parseInt(btn.dataset.courseId) || btn.dataset.courseId;
        const folderId = btn.dataset.folderId ? parseInt(btn.dataset.folderId) : null;
        try {
          if (folderId) {

            await removeCourseFromFolderAPI(folderId, courseId);
          } else {

            for (const folder of folders) {
              var _folder$courses2;
              const hasCourse = (_folder$courses2 = folder.courses) === null || _folder$courses2 === void 0 ? void 0 : _folder$courses2.some(c => {
                const cId = c.course_id || c.id;
                return cId === courseId || cId === String(courseId);
              });
              if (hasCourse) {
                await removeCourseFromFolderAPI(folder.id, courseId);
              }
            }
          }
          renderFolderList();
          await renderCourseGrid();
          showNotification('Course removed!', 'success');
        } catch (error) {
          console.error('Remove error:', error);
          showNotification('Failed to remove course: ' + error.message, 'error');
        }
      });
    });
  }

  function renderFloatingControls() {
    const existing = document.getElementById('udemy-combined-controls');
    if (existing) existing.remove();
    const container = document.createElement('div');
    container.id = 'udemy-combined-controls';
    const settingsBtn = document.createElement('button');
    settingsBtn.className = 'ucc-btn secondary';
    settingsBtn.innerHTML = `${ICONS.settings} Settings`;
    settingsBtn.addEventListener('click', showSettingsModal);
    const fetchBtn = document.createElement('button');
    fetchBtn.className = 'ucc-btn secondary';
    fetchBtn.innerHTML = `${ICONS.refresh} Fetch Cookies`;
    fetchBtn.addEventListener('click', async () => {
      await updateCookiesFromWorker();
    });
    if (config.showUiButtons) {
      container.appendChild(fetchBtn);
      container.appendChild(settingsBtn);
    }
    if (config.showFolderOrganizer) {
      const folderBtn = document.createElement('button');
      folderBtn.className = 'ucc-btn primary';
      folderBtn.innerHTML = `${ICONS.bookmark} My Folders`;
      folderBtn.addEventListener('click', () => {
        if (isOrganizerPopupOpen) {
          closeMainPopup();
        } else {
          createMainPopup();
        }
      });
      container.appendChild(folderBtn);
    }
    const isCourse = window.location.pathname.includes('/course/');
    if (isCourse && config.showFolderOrganizer) {
      const saveBtn = document.createElement('button');
      saveBtn.className = 'ucc-btn success';
      saveBtn.innerHTML = `${ICONS.plus} Save Course`;
      saveBtn.addEventListener('click', () => {
        const courseInfo = getCurrentCourseInfo();
        showAddCourseModal(courseInfo);
      });
      container.appendChild(saveBtn);
    }
    document.body.appendChild(container);
  }

  function startAutoUpdate() {
    const lastUpdate = GM_getValue('lastCookieUpdate', 0);
    const now = Date.now();
    const autoUpdateInterval = 4 * 60 * 60 * 1000; 
    if (now - lastUpdate > autoUpdateInterval) {
      updateCookiesFromWorker(true);
      GM_setValue('lastCookieUpdate', now);
    }
    setInterval(() => {
      updateCookiesFromWorker(true);
      GM_setValue('lastCookieUpdate', Date.now());
    }, autoUpdateInterval);
  }

  function registerMenuCommands() {
    GM_registerMenuCommand('🍪 Update Cookies Now', async () => {
      await updateCookiesFromWorker();
    });
    GM_registerMenuCommand('⚙️ Open Settings', showSettingsModal);
  }

  async function initialize() {
    loadConfig();

    if (config.licenseKey) {
      await syncFoldersFromServer();
    } else {
      loadFoldersFromLocal();
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', onDomReady);
    } else {
      onDomReady();
    }
    registerMenuCommands();
    startAutoUpdate();
  }
  function onDomReady() {
    injectStyles();
    renderFloatingControls();
    let lastUrl = location.href;
    new MutationObserver(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        setTimeout(renderFloatingControls, 1000);
      }
    }).observe(document.body, {
      childList: true,
      subtree: true
    });
  }
  initialize();
})();