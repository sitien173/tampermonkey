// ==UserScript==
// @name         AutoComplete
// @version      1.0.3
// @description  dummy data and fill
// @author       You
// @match        *://*/eidv/personMatch*
// @match        *://*/verification*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      auto-completed.sitienbmt.workers.dev
// ==/UserScript==

(function () {
  'use strict';

  // Config
  const BACKEND_ENDPOINT = 'https://auto-completed.sitienbmt.workers.dev';
  const CLICK_DELAY_MS = 600;

  // State
  let countrySelection = null;
  let isVerification = false;
  let isKyb = false;
  let isSearchFieldExisting = false;

  // Helpers (ported)
  const dobMonthOpts = [
    { text: 'January', value: 1 },
    { text: 'February', value: 2 },
    { text: 'March', value: 3 },
    { text: 'April', value: 4 },
    { text: 'May', value: 5 },
    { text: 'June', value: 6 },
    { text: 'July', value: 7 },
    { text: 'August', value: 8 },
    { text: 'September', value: 9 },
    { text: 'October', value: 10 },
    { text: 'November', value: 11 },
    { text: 'December', value: 12 },
  ];

  const genderMap = new Map([
    ['M', 'MALE'],
    ['MALE', 'MALE'],
    ['F', 'FEMALE'],
    ['FEMALE', 'FEMALE'],
  ]);

  function normalizeInput(input) {
    return String(input).toLowerCase().replace(/[()]/g, '').trim();
  }

  function normalizeMonthOfBirth(input) {
    input = String(input).trim();
    const numericInput = parseInt(input);
    if (!isNaN(numericInput) && numericInput >= 1 && numericInput <= 12) {
      const month = dobMonthOpts.find((m) => m.value === numericInput);
      return `${month.text} (${month.value})`;
    }
    const normalizedInput = normalizeInput(input);
    const monthByText = dobMonthOpts.find(
      (m) => normalizeInput(m.text) === normalizedInput
    );
    if (monthByText) return `${monthByText.text} (${monthByText.value})`;

    const complexMatch = normalizedInput.match(/([a-z]+)\s*(?:\()?(\d+)(?:\))?/);
    if (complexMatch) {
      const [, monthText, monthValue] = complexMatch;
      const month = dobMonthOpts.find(
        (m) =>
          normalizeInput(m.text) === monthText.trim() ||
          m.value === parseInt(monthValue)
      );
      if (month) return `${month.text} (${month.value})`;
    }
    return 'Invalid month input';
  }

  function compareGender(a, b) {
    if (!a || !b) return false;
    const norm = (x) => x.trim().toUpperCase();
    const extractParen = (s) => (s.match(/\(([^)]+)\)/) || [])[1];
    const stripParen = (s) => s.replace(/\s*\([^)]*\)\s*/g, '').trim();

    const n1 = norm(a), n2 = norm(b);
    const c1 = stripParen(n1), c2 = stripParen(n2);
    const p1 = extractParen(n1), p2 = extractParen(n2);

    const s1 = genderMap.get(c1) || genderMap.get(p1) || c1;
    const s2 = genderMap.get(c2) || genderMap.get(p2) || c2;
    return s1 === s2;
  }

  function compareStrings(a, b) {
    if (!a || !b) return false;
    a = a.trim().toUpperCase();
    b = b.trim().toUpperCase();
    if (a === b) return true;

    const abbr = (s) => (s.match(/\(([^)]+)\)/) || [])[1];
    const strip = (s) => s.replace(/\s*\([^)]*\)\s*/g, '').trim();

    const aAbbr = abbr(a), bAbbr = abbr(b);
    const aClean = strip(a), bClean = strip(b);

    return (
      (aAbbr && bClean === aAbbr) ||
      (bAbbr && aClean === bAbbr) ||
      aClean === bClean ||
      (aAbbr && bAbbr && aAbbr === bAbbr)
    );
  }

  // Environment detection
  function detectContext() {
    isVerification = window.location.href.endsWith('verification');
    const kybRootId = 'KYBMFComponent';
    isKyb = isVerification && !!document.getElementById(kybRootId);

    if (isVerification) {
      // Old UI country text
      const el = isKyb
        ? document.getElementById(kybRootId)
        : document.querySelector('td.country-name');
      if (el) {
        const text = isKyb
          ? document
              .querySelector('[data-testid=country-selection-inputbox] #search')
              ?.value
          : el.textContent;
        countrySelection = text ? text.toUpperCase() : null;
      }
    } else {
      // New UI country is in search input as "Country (code)"
      const searchInput = document.querySelector('input[name="search"]');
      if (searchInput) {
        const m = searchInput.value.match(/^(.+?) \(/);
        if (m) countrySelection = m[1].toUpperCase();
      }
    }
  }

  // Field discovery (ported)
  function getOldUIFields() {
    const selectors = [
      '.mat-input',
      '[id^=number-range-field-]',
      '[id^=option-field-]',
      '[id^=number-range-picker]',
      'input.form-control',
    ];
    const fields = [
      ...new Set(
        selectors.flatMap((selector) =>
          Array.from(document.querySelectorAll(selector)).map((item) =>
            (item.getAttribute('id') || '').split('-').pop()
          )
        )
      ),
    ].filter(Boolean);

    const refIndex = fields.indexOf('Customer Reference ID');
    if (refIndex !== -1) fields.splice(refIndex, 1);
    return fields;
  }

  function getNewUIFields() {
    const fields = [
      ...new Set(
        Array.from(document.querySelectorAll('.form-control'))
          .map((item) => item.getAttribute('name'))
          .slice(1)
      ),
    ].filter(Boolean);

    const searchIndex = fields.indexOf('search');
    if (searchIndex !== -1) {
      isSearchFieldExisting = true;
      fields.splice(searchIndex, 1);

      const searchFields = document.querySelectorAll('[data-testid$="-search-field"]');
      searchFields.forEach((sf) => {
        const field = sf.getAttribute('data-testid').split('-').shift().trim();
        fields.push(field);
      });
    }
    return fields;
  }

  function getFormFields() {
    if (isVerification) return getOldUIFields();
    return getNewUIFields();
  }

  // Parsing and filling (ported)
  function parseKeyValueLines(text) {
    const parsed = {};
    const invalid = new Set([
      'null', 'none', 'na', 'n/a', '', 'undefined',
      'unspecified', 'unknown', 'not applicable', 'not available', 'not provided',
    ]);
    text.split('\n').forEach((line) => {
      const [k, v] = line.split('=').map((p) => p?.trim());
      if (k && v && !invalid.has(v.toLowerCase())) parsed[k] = v;
    });
    return parsed;
  }

  function handleSelectField(selectEl, responseMap) {
    const options = selectEl.querySelectorAll('option');
    let optionIndex = -1;
    const field = (selectEl.getAttribute('id') || '').split('-').pop();
    const value = responseMap[field];

    switch (field) {
      case 'MonthOfBirth': {
        const month = normalizeMonthOfBirth(value);
        optionIndex = Array.from(options).findIndex(
          (o) => normalizeMonthOfBirth(o.getAttribute('value')) === month
        );
        break;
      }
      case 'Gender':
        optionIndex = Array.from(options).findIndex((o) =>
          compareGender(o.getAttribute('value'), value)
        );
        break;
      default:
        optionIndex = Array.from(options).findIndex((o) =>
          compareStrings(o.getAttribute('value'), value)
        );
        break;
    }
    if (optionIndex >= 0) {
      options[optionIndex].selected = true;
    }
    else {
      const randomIndex = Math.floor(Math.random() * options.length);
      options[randomIndex].selected = true;
    }
  }

  function rejectSearchFields() {
    if (!isSearchFieldExisting) return;
    const icons = document.querySelectorAll('[data-icon=xmark]');
    if (icons.length > 1) {
      for (let i = 1; i < icons.length; i++) {
        icons[i].dispatchEvent(new MouseEvent('click', { bubbles: true, cancellable: true }));
      }
    }
  }

  function handleSearchField(responseMap) {
    if (!isSearchFieldExisting) return;
    document.querySelectorAll('input[name=search]').forEach((searchInput) => {
      searchInput.click();
      document.querySelectorAll('[id$=-dropdown-menu]').forEach((dropDown) => {
        const options = dropDown.querySelectorAll('[data-testid*=-dropdown-row-]');
        const field = dropDown.getAttribute('id').split('-').shift().trim();
        const value = responseMap[field];
        let option = null;

        switch (field) {
          case 'countrySelection':
            break;
          case 'MonthOfBirth': {
            const month = normalizeMonthOfBirth(value);
            option = Array.from(options).find(
              (opt) => normalizeMonthOfBirth(opt.textContent) === month
            );
            break;
          }
          case 'Gender':
            option = Array.from(options).find((opt) =>
              compareGender(opt.textContent, value)
            );
            break;
          default:
            option = Array.from(options).find((opt) =>
              compareStrings(opt.textContent, value)
            );
            break;
        }
        if (option) {
          option.dispatchEvent(
            new MouseEvent('click', { bubbles: true, cancellable: true })
          );
        }
      });
    });
  }

  function resetFormFields() {
    const fields = getFormFields();
    fields.forEach((field) => {
      const control = document.querySelector(`[name="${field}"], [id$="${field}"]`);
      if (!control) return;
      if (control.tagName.toLowerCase() === 'select') {
        control.selectedIndex = 0;
      } else {
        control.value = '';
      }
      control.dispatchEvent(new Event('change', { bubbles: true }));
    });
    rejectSearchFields();
  }

  function clickTestTransactionCheckboxes() {
    if (isVerification) {
      // Old UI
      const consentText = 'I agree T&C*';
      document.querySelectorAll('div:has(+ label input[type="checkbox"])').forEach((div) => {
        if (!div.textContent.includes(consentText)) return;
        const checkbox = div.nextElementSibling?.querySelector('input[type="checkbox"]');
        if (checkbox?.checked === false) checkbox.click();
      });

      const TEST_TRANSACTION_TEXT = 'Run A Test Transaction';
      document.querySelectorAll('input[type="checkbox"] ~ span').forEach((span) => {
        if (!span.textContent.includes(TEST_TRANSACTION_TEXT)) return;
        const checkbox = span.previousElementSibling?.previousElementSibling;
        if (checkbox?.type === 'checkbox' && !checkbox.checked) checkbox.click();
      });
    } else {
      // New UI
      const TEST_TRANSACTION_TEXT = 'Run a Test Transaction';
      setTimeout(() => {
        document.querySelectorAll('input[type="checkbox"] + p').forEach((p) => {
          if (!p.textContent.includes(TEST_TRANSACTION_TEXT)) return;
          const checkbox = p.previousElementSibling;
          if (checkbox?.type === 'checkbox' && !checkbox.checked) checkbox.click();
        });
      }, CLICK_DELAY_MS);
    }
  }

  // Enhanced form control handling
  function setNativeValue(el, value) {
    const prototype = Object.getPrototypeOf(el);
    const desc = Object.getOwnPropertyDescriptor(prototype, 'value');
    if (desc && desc.set) {
      desc.set.call(el, value);
    } else {
      el.value = value;
    }
  }

  function commitInput(el) {
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function setControlValue(control, value, responseMap) {
    const tag = control.tagName.toLowerCase();
    if (tag === 'select') {
      handleSelectField(control, responseMap);
      commitInput(control);
      return;
    }

    if (tag === 'input') {
      const type = (control.getAttribute('type') || '').toLowerCase();
      if (type === 'checkbox') {
        const desired = value === true || String(value).toLowerCase() === 'true';
        if (control.checked !== desired) {
          control.click(); // click toggles and triggers events in most frameworks
        }
        return;
      }
      if (type === 'radio') {
        const name = control.getAttribute('name');
        const radios = document.querySelectorAll(`input[type="radio"][name="${name}"]`);
        const match = Array.from(radios).find(r => compareStrings(r.value, value) || compareStrings(r.id, value) || compareStrings(r.getAttribute('data-value') || '', value));
        if (match && !match.checked) {
          match.click();
        }
        return;
      }
    }

    // Default: text-like controls
    control.focus();
    setNativeValue(control, value);
    commitInput(control);
    control.blur();
  }

  function fillFormFields(responseMap) {
    resetFormFields();
    handleSearchField(responseMap);

    if (isVerification) {
      if (responseMap.MonthOfBirth) {
        const idx = dobMonthOpts.findIndex(
          (m) => normalizeMonthOfBirth(m.text) === normalizeMonthOfBirth(responseMap.MonthOfBirth)
        );
        if (idx !== -1) {
          responseMap.MonthOfBirth = dobMonthOpts[idx].value;
        }
      }
    }
    else {
      // new UI already handled by clickTestTransactionCheckboxes()
    }

    for (const [key, value] of Object.entries(responseMap)) {
      const control = document.querySelector(`[name="${key}"], [id$="${key}"]`);
      if (!control) continue;

      setControlValue(control, value, responseMap);
    }
  }

  // Network
  function postJson(url, body) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'POST',
        url,
        headers: { 'Content-Type': 'application/json' },
        data: JSON.stringify(body),
        onload: (res) => resolve(res),
        onerror: (err) => reject(err),
        ontimeout: () => reject(new Error('Timeout')),
      });
    });
  }

  async function fetchExtractedDataFromClipboard(fields) {
    const clipboardText = await navigator.clipboard.readText();
    if (!clipboardText || !clipboardText.trim()) {
      throw new Error('Clipboard is empty');
    }
    const payload = {
      fields: fields.join(','),
      unstructuredData: clipboardText,
    };
    const res = await postJson(`${BACKEND_ENDPOINT}/api/extracting-data`, payload);
    const json = JSON.parse(res.responseText);
    if (!json.success) throw new Error(json.message || 'Error extracting data');
    return json.result; // expected key=value lines
  }

  async function fetchDummyData(fields, countrySelection) {
    const cached_value = GM_getValue(`autocompleted_${countrySelection}_${fields.join(',')}`);
    if (cached_value){
      return JSON.parse(cached_value).result;
    }
    const rules = GM_getValue(
      `autocompleted-countrySelectionRules_${countrySelection}`,
      ''
    );
    const payload = {
      country: countrySelection,
      fields: fields.join(','),
      rule: rules || '',
    };
    const res = await postJson(`${BACKEND_ENDPOINT}/api/dummy-data`, payload);
    const json = JSON.parse(res.responseText);
    GM_setValue(`autocompleted_${countrySelection}_${fields.join(',')}`, res.responseText)
    return json.result; // server returns key=value lines
  }

  // Wait for fields to be available
  async function waitForFields(timeoutMs = 5000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const fields = getFormFields();
      if (fields && fields.length > 0) return fields;
      await new Promise(r => setTimeout(r, 150));
    }
    return getFormFields();
  }

  // UI trigger
  function addFloatingButton() {
    const btn = document.createElement('button');
    btn.textContent = 'Auto Fill';
    btn.style.cssText = `
      position: fixed;
      z-index: 999999;
      bottom: 20px;
      right: 20px;
      background: #1f6feb;
      color: #fff;
      border: none;
      border-radius: 6px;
      padding: 10px 14px;
      cursor: pointer;
      box-shadow: 0 4px 10px rgba(0,0,0,0.15);
      font-size: 14px;
    `;
    btn.addEventListener('click', async () => {
      let success = false;
      // Disable during processing
      btn.disabled = true;
      btn.style.opacity = '0.6';
      btn.style.cursor = 'not-allowed';
      btn.textContent = 'Auto Fill…';
      try {
        detectContext();
        const fields = await waitForFields();
        if (!fields || fields.length === 0) {
          throw new Error('No fields detected.');
        }
        if (!countrySelection) {
          throw new Error('Country selection not found.');
        }
        clickTestTransactionCheckboxes();

        const textContent = await fetchDummyData(fields, countrySelection);
        const parsed = parseKeyValueLines(textContent);
        fillFormFields(parsed);
        
        // Retry search fields after a delay to let dropdowns mount
        await new Promise(r => setTimeout(r, 150));
        handleSearchField(parsed);
        success = true;
      } catch (e) {
        console.error(e);
        alert('Auto Fill failed: ' + (e?.message || e));
      } finally {
        btn.disabled = false;
        btn.style.opacity = '';
        btn.style.cursor = 'pointer';
        btn.textContent = 'Auto Fill';
      }
    });
    document.body.appendChild(btn);
  }

  function addPasteAndFillButton() {
    const btn = document.createElement('button');
    btn.textContent = 'Paste & Fill';
    btn.style.cssText = `
      position: fixed;
      z-index: 999999;
      bottom: 20px;
      right: 120px;
      background: #6e40c9;
      color: #fff;
      border: none;
      border-radius: 6px;
      padding: 10px 14px;
      cursor: pointer;
      box-shadow: 0 4px 10px rgba(0,0,0,0.15);
      font-size: 14px;
    `;
    btn.addEventListener('click', async () => {
      let success = false;
      btn.disabled = true;
      btn.style.opacity = '0.6';
      btn.style.cursor = 'not-allowed';
      btn.textContent = 'Paste & Fill…';
      try {
        detectContext();
        const fields = await waitForFields();
        if (!fields || fields.length === 0) {
          throw new Error('No fields detected.');
        }
        clickTestTransactionCheckboxes();

        const textContent = await fetchExtractedDataFromClipboard(fields);
        const parsed = parseKeyValueLines(textContent);
        fillFormFields(parsed);

        await new Promise(r => setTimeout(r, 150));
        handleSearchField(parsed);
        success = true;
      } catch (e) {
        console.error(e);
        alert('Paste & Fill failed: ' + (e?.message || e));
      } finally {
        btn.disabled = false;
        btn.style.opacity = '';
        btn.style.cursor = 'pointer';
        btn.textContent = 'Paste & Fill';
      }
    });
    document.body.appendChild(btn);
  }

  // Init
  window.addEventListener('load', () => {
    detectContext();
    addFloatingButton();
    addPasteAndFillButton();
  });
})();
