// ==UserScript==
// @name         Cookie Updater
// @namespace https://greasyfork.org/users/1508709
// @version      1.0.0
// @author       https://github.com/sitien173
// @match        *://*.udemy.com/*
// @match        *://*.itauchile.udemy.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_cookie
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @connect      udemy-cookies-worker.sitienbmt.workers.dev
// @run-at       document-start
// ==/UserScript==
/* eslint-disable */
/* global GM_getValue, GM_setValue */
(function() {
    // Configuration
    const DEFAULT_CONFIG = {
        workerUrl: 'https://udemy-cookies-worker.sitienbmt.workers.dev/',
        autoUpdateInterval: 5 * 60 * 1000, // 5 minutes
        autoUpdateEnabled: true,
        showNotifications: true,
        autoReload: true,
        retryAttempts: 3
    };

    let config = { ...DEFAULT_CONFIG };

    // Load configuration
    function loadConfig() {
        const savedConfig = GM_getValue('config', {});
        config = { ...DEFAULT_CONFIG, ...savedConfig };
    }

    // Save configuration
    function saveConfig() {
        GM_setValue('config', config);
    }

    // Fetch cookies from worker with retry logic using GM_xmlhttpRequest
    async function fetchCookiesFromWorker() {
        let lastError;
        
        for (let attempt = 1; attempt <= config.retryAttempts; attempt++) {
            try {
                console.log(`Fetching cookies from worker (attempt ${attempt}/${config.retryAttempts})...`);
                
                return new Promise((resolve, reject) => {
                    GM_xmlhttpRequest({
                        method: 'GET',
                        url: config.workerUrl,
                        onload: function(response) {
                            if (response.status === 200) {
                                try {
                                    const cookies = JSON.parse(response.responseText);
                                    console.log(`Successfully fetched ${cookies.length} cookies from worker`);
                                    resolve(cookies);
                                } catch (error) {
                                    console.error('Failed to parse JSON response:', error);
                                    reject(error);
                                }
                            } else {
                                reject(new Error(`HTTP ${response.status}: ${response.statusText}`));
                            }
                        },
                        onerror: function(error) {
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

    // Save cookie using GM_cookie
    function saveCookie(cookie, url) {
        return new Promise((resolve, reject) => {
            const cookieDetails = {
                name: cookie.name,
                value: cookie.value,
                url: url,
                domain: cookie.domain || undefined,
                path: cookie.path || '/',
                secure: cookie.secure || false,
                httpOnly: cookie.httpOnly || false,
                sameSite: cookie.sameSite || 'no_restriction'
            };

            // Set expiration if provided
            if (cookie.expirationDate) {
                cookieDetails.expirationDate = cookie.expirationDate;
            }

            GM_cookie.set(cookieDetails, (result, error) => {
                if (error) {
                    console.error('Failed to save cookie:', error);
                    reject(error);
                } else {
                    console.log(`Successfully saved cookie: ${cookie.name}`);
                    resolve(result);
                }
            });
        });
    }

    // Remove cookie using GM_cookie
    function removeCookie(name, url) {
        return new Promise((resolve, reject) => {
            GM_cookie.delete({
                name: name,
                url: url
            }, (result, error) => {
                if (error) {
                    console.error('Failed to remove cookie:', error);
                    reject(error);
                } else {
                    console.log(`Successfully removed cookie: ${name}`);
                    resolve(result);
                }
            });
        });
    }

    // Get all cookies for current domain using GM_cookie
    function getAllCookies(url) {
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

    // Update cookies from worker
    async function updateCookiesFromWorker() {
        try {
            console.log('Starting cookie update process...');
            const newCookies = await fetchCookiesFromWorker();
            
            if (!newCookies || !Array.isArray(newCookies) || newCookies.length === 0) {
                console.log('No cookies were fetched from worker.');
                showNotification('No cookies were fetched from worker.', 'warning');
                return { success: false, message: 'No cookies fetched' };
            }

            const currentUrl = window.location.href;
            const existingCookies = await getAllCookies(currentUrl);
            const existingCookieNames = existingCookies.map(c => c.name);
            
            let successCount = 0;
            let errorCount = 0;
            
            // Process each new cookie
            for (const cookie of newCookies) {
                try {
                    // Remove existing cookie if it exists
                    if (existingCookieNames.includes(cookie.name)) {
                        await removeCookie(cookie.name, currentUrl);
                        console.log(`Removed existing cookie: ${cookie.name}`);
                    }

                    // Add new cookie
                    await saveCookie(cookie, currentUrl);
                    successCount++;
                    console.log(`Successfully saved cookie: ${cookie.name}`);
                    
                } catch (error) {
                    errorCount++;
                    console.error(`Failed to process cookie ${cookie.name}:`, error);
                }
            }

            const message = `Updated ${successCount} cookies successfully${errorCount > 0 ? `, ${errorCount} failed` : ''}`;
            showNotification(message, errorCount > 0 ? 'error' : 'success');
            
            // Auto reload if enabled
            if (config.autoReload && successCount > 0) {
                setTimeout(() => {
                    window.location.reload();
                }, 1000);
            }
            
            return { success: true, stats: { total: newCookies.length, success: successCount, error: errorCount } };
            
        } catch (error) {
            console.error('Error updating cookies:', error);
            showNotification('Failed to update cookies: ' + error.message, 'error');
            return { success: false, error: error.message };
        }
    }

    // Show notification
    function showNotification(message, type = 'info') {
        if (!config.showNotifications) return;
        
        const existingNotification = document.getElementById('udemy-cookie-notification');
        if (existingNotification) {
            existingNotification.remove();
        }

        const notification = document.createElement('div');
        notification.id = 'udemy-cookie-notification';
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 20px;
            border-radius: 5px;
            color: white;
            font-family: Arial, sans-serif;
            font-size: 14px;
            z-index: 10000;
            max-width: 300px;
            word-wrap: break-word;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            transition: opacity 0.3s ease;
        `;

        switch (type) {
            case 'success':
                notification.style.backgroundColor = '#4CAF50';
                break;
            case 'error':
                notification.style.backgroundColor = '#f44336';
                break;
            case 'warning':
                notification.style.backgroundColor = '#ff9800';
                break;
            default:
                notification.style.backgroundColor = '#2196F3';
        }

        notification.textContent = message;
        document.body.appendChild(notification);

        setTimeout(() => {
            if (notification.parentNode) {
                notification.style.opacity = '0';
                setTimeout(() => {
                    if (notification.parentNode) {
                        notification.remove();
                    }
                }, 300);
            }
        }, 3000);
    }

    // Create settings panel
    function createSettingsPanel() {
        const panel = document.createElement('div');
        panel.id = 'udemy-cookie-settings-panel';
        panel.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
            z-index: 10001;
            font-family: Arial, sans-serif;
            min-width: 400px;
        `;

        panel.innerHTML = `
            <h2 style="margin-top: 0; color: #333;">Udemy Cookie Updater Settings</h2>
            
            <div style="margin-bottom: 15px;">
                <label style="display: block; margin-bottom: 5px; font-weight: bold;">Worker URL:</label>
                <input type="text" id="worker-url" value="${config.workerUrl}" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
            </div>
            
            <div style="margin-bottom: 15px;">
                <label style="display: block; margin-bottom: 5px; font-weight: bold;">Auto Update Interval (minutes):</label>
                <input type="number" id="auto-update-interval" value="${config.autoUpdateInterval / 60000}" min="1" max="60" style="width: 100px; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
            </div>
            
            <div style="margin-bottom: 15px;">
                <label style="display: flex; align-items: center; cursor: pointer;">
                    <input type="checkbox" id="auto-update-enabled" ${config.autoUpdateEnabled ? 'checked' : ''} style="margin-right: 8px;">
                    Enable Auto Update
                </label>
            </div>
            
            <div style="margin-bottom: 15px;">
                <label style="display: flex; align-items: center; cursor: pointer;">
                    <input type="checkbox" id="show-notifications" ${config.showNotifications ? 'checked' : ''} style="margin-right: 8px;">
                    Show Notifications
                </label>
            </div>
            
            <div style="margin-bottom: 15px;">
                <label style="display: flex; align-items: center; cursor: pointer;">
                    <input type="checkbox" id="auto-reload" ${config.autoReload ? 'checked' : ''} style="margin-right: 8px;">
                    Auto Reload Page After Update
                </label>
            </div>
            
            <div style="display: flex; gap: 10px; justify-content: flex-end;">
                <button id="save-settings" style="padding: 10px 20px; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer;">Save Settings</button>
                <button id="cancel-settings" style="padding: 10px 20px; background: #9E9E9E; color: white; border: none; border-radius: 4px; cursor: pointer;">Cancel</button>
            </div>
        `;

        panel.querySelector('#save-settings').addEventListener('click', () => {
            config.workerUrl = panel.querySelector('#worker-url').value;
            config.autoUpdateInterval = parseInt(panel.querySelector('#auto-update-interval').value) * 60000;
            config.autoUpdateEnabled = panel.querySelector('#auto-update-enabled').checked;
            config.showNotifications = panel.querySelector('#show-notifications').checked;
            config.autoReload = panel.querySelector('#auto-reload').checked;
            
            saveConfig();
            panel.remove();
            showNotification('Settings saved successfully!', 'success');
        });

        panel.querySelector('#cancel-settings').addEventListener('click', () => {
            panel.remove();
        });

        panel.addEventListener('click', (e) => {
            if (e.target === panel) {
                panel.remove();
            }
        });

        document.body.appendChild(panel);
    }

    // Auto-update functionality
    function startAutoUpdate() {
        const lastUpdate = GM_getValue('lastCookieUpdate', 0);
        const now = Date.now();
        
        if (now - lastUpdate > config.autoUpdateInterval) {
            updateCookiesFromWorker();
            GM_setValue('lastCookieUpdate', now);
        }
        
        setInterval(() => {
            updateCookiesFromWorker();
            GM_setValue('lastCookieUpdate', Date.now());
        }, config.autoUpdateInterval);
    }

    // Register menu commands
    function registerMenuCommands() {
        GM_registerMenuCommand('Update Cookies Now', async () => {
            await updateCookiesFromWorker();
        });
        
        GM_registerMenuCommand('Open Settings', () => {
            createSettingsPanel();
        });
    }

    // Initialize
    function initialize() {
        loadConfig();
        
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initialize);
            return;
        }
        
        registerMenuCommands();
        
        if (config.autoUpdateEnabled) {
            startAutoUpdate();
        }
    }

    initialize();

})();
