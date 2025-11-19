// ==UserScript==
// @name         Workflow AutoCompleted
// @version      0.1.0
// @description  Automatically fills workflow forms based on backend dummy data
// @author       https://github.com/sitien173
// @match        *://192.168.1.253:3002/*
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @connect      192.168.1.253
// @connect      auto-completed.sitienbmt.workers.dev
// @run-at       document-idle
// ==/UserScript==

(function () {
    "use strict";

    const FLOW_ENDPOINT_BASE = "https://192.168.1.253:8081/interpreter-v2/flow";
    const DUMMY_DATA_ENDPOINT = "https://auto-completed.sitienbmt.workers.dev/api/dummy-data";
    const COUNTRY_FIELD_NAME = "Country of residence";
    const REACT_SELECT_ID_PATTERN = /^react-select-(\d+)/;

    let formElements = [];
    let countrySelection = null;

    const delay = (ms) =>
        new Promise((resolve) => {
            globalThis.setTimeout(resolve, ms);
        });

    const cssEscape = (value) => {
        if (globalThis.CSS?.escape) {
            return globalThis.CSS.escape(value);
        }
        return String(value).replaceAll(/[^a-zA-Z0-9_-]/g, (character) => `\\${character}`);
    };

    function log(...args) {
        console.debug("[Workflow AutoCompleted]", ...args);
    }

    function getFlowIdFromPath() {
        const path = globalThis.location.pathname || "";
        const segments = path.split("/").filter(Boolean);
        if (segments.length === 0) return null;
        return segments.at(-1);
    }

    function gmRequest(options) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                ...options,
                onload: (response) => {
                    if (response.status >= 200 && response.status < 300) {
                        resolve(response);
                    } else {
                        reject(
                            new Error(
                                `Request failed (${response.status}): ${response.responseText || response.statusText}`
                            )
                        );
                    }
                },
                onerror: (err) => reject(err),
                ontimeout: () => reject(new Error("Request timed out")),
            });
        });
    }

    async function fetchFlowDefinition() {
        const flowId = getFlowIdFromPath();
        if (!flowId) {
            throw new Error("Unable to determine flowId from the current URL");
        }

        const url = `${FLOW_ENDPOINT_BASE}/${encodeURIComponent(flowId)}`;
        log("Fetching flow definition", { flowId, url });
        const response = await gmRequest({
            method: "GET",
            url,
        });
        const json = JSON.parse(response.responseText);
        if (!json || !Array.isArray(json.elements)) {
            throw new Error("Unexpected flow definition shape");
        }
        formElements = Array.isArray(json.elements) ? json.elements : [];
        log("Flow definition loaded", { fieldCount: formElements.length });
    }

    function parseKeyValueLines(text) {
        const map = {};
        if (!text) return map;
        for (const line of text.split(/\r?\n/)) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            const sepIndex = trimmed.indexOf("=");
            if (sepIndex === -1) continue;
            const key = trimmed.slice(0, sepIndex).trim();
            const value = trimmed.slice(sepIndex + 1).trim();
            if (key) map[key] = value;
        }
        return map;
    }

    function setNativeValue(element, value) {
        const prototype = Object.getPrototypeOf(element);
        const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
        if (descriptor && typeof descriptor.set === "function") {
            descriptor.set.call(element, value);
        } else {
            element.value = value;
        }
    }

    function commitInput(element) {
        element.dispatchEvent(new Event("input", { bubbles: true }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
    }

    function compareStrings(a, b) {
        if (!a || !b) return false;
        const norm = (str) => String(str).trim().toUpperCase();
        return norm(a) === norm(b);
    }

    function triggerPointerAndMouseEvents(element) {
        if (!element) return;
        const PointerCtor = globalThis.PointerEvent || MouseEvent;
        const events = [
            { type: "pointerdown", constructor: PointerCtor },
            { type: "mousedown", constructor: MouseEvent },
            { type: "pointerup", constructor: PointerCtor },
            { type: "mouseup", constructor: MouseEvent },
            { type: "click", constructor: MouseEvent },
        ];
        for (const { type, constructor } of events) {
            try {
                element.dispatchEvent(
                    new constructor(type, {
                        bubbles: true,
                        cancelable: true,
                        view: globalThis,
                    })
                );
            } catch (error) {
                log("Failed to dispatch event", { type, element }, error);
            }
        }
    }

    function extractIndexFromString(candidate) {
        if (!candidate) return null;
        const parts = Array.isArray(candidate) ? candidate : String(candidate).split(/\s+/);
        for (const part of parts) {
            const execResult = REACT_SELECT_ID_PATTERN.exec(String(part));
            if (execResult) return execResult[1];
        }
        return null;
    }

    function extractReactSelectIndex(element) {
        if (!element) return null;
        const directIdIndex = extractIndexFromString(element.id);
        if (directIdIndex) return directIdIndex;

        const ariaDescribedByIndex = extractIndexFromString(
            element.getAttribute?.("aria-describedby")
        );
        if (ariaDescribedByIndex) return ariaDescribedByIndex;

        const ariaControlsIndex = extractIndexFromString(element.getAttribute?.("aria-controls"));
        if (ariaControlsIndex) return ariaControlsIndex;

        let current = element.parentElement;
        while (current && current !== document.body) {
            const parentIndex = extractIndexFromString(current.id);
            if (parentIndex) return parentIndex;
            current = current.parentElement;
        }
        return null;
    }

    async function waitForReactSelectListbox(index, timeoutMs = 1500) {
        const listboxId = `react-select-${index}-listbox`;
        const endTime = Date.now() + timeoutMs;
        while (Date.now() < endTime) {
            const listbox = document.getElementById(listboxId);
            if (listbox) return listbox;
            await delay(50);
        }
        return null;
    }

    function getReactSelectOptions(listbox, index) {
        if (!listbox) return [];
        const selector = `[id^="react-select-${index}-option-"]`;
        const rawOptions = listbox.querySelectorAll(selector);
        const options = [];
        for (const option of rawOptions) {
            if (option.getAttribute("aria-disabled") === "true") continue;
            options.push(option);
        }
        return options;
    }

    function pickReactSelectOption(options, desiredValue) {
        if (!options.length) return null;
        if (desiredValue) {
            const normalizedDesired = desiredValue.trim().toLowerCase();
            for (const option of options) {
                const optionText = option.textContent?.trim().toLowerCase();
                if (optionText === normalizedDesired) {
                    return option;
                }
            }
        }
        const randomIndex = Math.floor(Math.random() * options.length);
        return options[randomIndex];
    }

    async function openReactSelect(control) {
        const index = extractReactSelectIndex(control);
        if (!index) return null;
        const clickTarget = control.closest('[class*="-control"]') || control;
        triggerPointerAndMouseEvents(clickTarget);
        control.focus();
        const listbox = await waitForReactSelectListbox(index);
        if (!listbox) return null;
        return { index, listbox };
    }

    function applyReactSelectOption(option, elementDefinition) {
        triggerPointerAndMouseEvents(option);
        const optionText = option.textContent?.trim();
        if (elementDefinition?.name === COUNTRY_FIELD_NAME && optionText) {
            countrySelection = optionText;
        }
    }

    async function fillReactSelectControl(control, value, elementDefinition) {
        const context = await openReactSelect(control);
        if (!context) return false;
        const { index, listbox } = context;
        const options = getReactSelectOptions(listbox, index);
        const optionToSelect = pickReactSelectOption(options, value);
        if (!optionToSelect) return false;
        applyReactSelectOption(optionToSelect, elementDefinition);
        await delay(100);
        return true;
    }

    function buildSelectorsForElement(elementDefinition) {
        const selectors = [];
        const { id, role, name } = elementDefinition;
        if (id) {
            const escapedId = cssEscape(id);
            selectors.push(
                `#${escapedId}`,
                `[id="${id}"]`,
                `[name="${id}"]`,
                `[data-element-id="${id}"] input`,
                `[data-element-id="${id}"] select`,
                `[data-element-id="${id}"] textarea`,
                `[data-testid="${id}"]`,
                `[data-testid="${id}"] input`,
                `[data-testid="${id}"] select`,
                `[data-testid="text-field-input-${id}"]`,
                `[data-testid="text-field-input-${id}-number"]`
            );
        }
        if (role) {
            selectors.push(
                `[name="${role}"]`,
                `[id$="${role}"]`,
                `[data-role="${role}"]`
            );
        }
        if (name) {
            selectors.push(
                `input[aria-label="${name}"]`,
                `input[placeholder="${name}"]`,
                `textarea[aria-label="${name}"]`,
                `textarea[placeholder="${name}"]`,
                `select[aria-label="${name}"]`,
                `input[name="${name}"]`,
                `textarea[name="${name}"]`,
                `select[name="${name}"]`
            );
        }
        return selectors;
    }

    function collectInteractiveControls(selectors) {
        const controls = new Set();
        for (const selector of selectors) {
            try {
                const nodes = document.querySelectorAll(selector);
                for (const node of nodes) {
                    if (
                        node instanceof HTMLInputElement ||
                        node instanceof HTMLSelectElement ||
                        node instanceof HTMLTextAreaElement
                    ) {
                        controls.add(node);
                    }
                }
            } catch (error) {
                log("Invalid selector ignored", selector, error);
            }
        }
        return controls;
    }

    function findControlViaLabel(name) {
        if (!name) return null;
        const labelNodes = document.querySelectorAll("label");
        for (const label of labelNodes) {
            if (label.textContent?.trim() !== name) continue;
            const htmlFor = label.getAttribute("for");
            if (!htmlFor) continue;
            const labelledControl = document.getElementById(htmlFor);
            if (labelledControl) {
                return labelledControl;
            }
        }
        return null;
    }

    function addTypeSpecificControls(controls, elementDefinition) {
        const { id, type } = elementDefinition;
        if (!id) return;

        if (type === "phone_number") {
            const numberInput = document.querySelector(
                `[data-testid="text-field-input-${id}-number"]`
            );
            if (numberInput) controls.add(numberInput);

            const codeInput = document.getElementById(`${id}-code`);
            if (codeInput) controls.add(codeInput);
            return;
        }

        if (type === "email") {
            const emailInput = document.querySelector(
                `[data-testid="text-field-input-${id}"]`
            );
            if (emailInput) controls.add(emailInput);
        }
    }

    function findControlsForElement(elementDefinition) {
        const selectors = buildSelectorsForElement(elementDefinition);
        const controls = collectInteractiveControls(selectors);
        if (!controls.size) {
            const labelledControl = findControlViaLabel(elementDefinition.name);
            if (labelledControl) controls.add(labelledControl);
        }
        addTypeSpecificControls(controls, elementDefinition);
        return Array.from(controls);
    }

    function fillSelectControl(control, value) {
        const options = Array.from(control.options);
        let matched = false;
        for (const option of options) {
            if (compareStrings(option.value, value) || compareStrings(option.textContent, value)) {
                control.value = option.value;
                matched = true;
            }
        }
        if (!matched) {
            control.value = value;
        }
        commitInput(control);
    }

    function fillCheckboxControl(control, value) {
        const desired = value === true || String(value).toLowerCase() === "true";
        if (control.checked !== desired) {
            control.click();
        }
    }

    function fillRadioControl(control, value) {
        const name = control.name;
        if (!name) return;
        const candidates = document.querySelectorAll(`input[type="radio"][name="${name}"]`);
        for (const radio of candidates) {
            if (
                compareStrings(radio.value, value) ||
                compareStrings(radio.id, value) ||
                compareStrings(radio.dataset?.value, value)
            ) {
                if (!radio.checked) radio.click();
            }
        }
    }

    function fillTextControl(control, value) {
        control.focus();
        setNativeValue(control, value);
        commitInput(control);
        control.blur();
    }

    function isReactSelectControl(control) {
        if (!control) return false;
        const index = extractReactSelectIndex(control);
        if (!index) return false;
        if (control.id?.endsWith("-listbox")) return false;
        return true;
    }

    async function fillControl(control, value, elementDefinition) {
        if (!control || value === undefined || value === null) return;
        if (isReactSelectControl(control)) {
            const handled = await fillReactSelectControl(control, value, elementDefinition);
            if (handled) return;
        }
        const tagName = control.tagName.toLowerCase();

        if (tagName === "select") {
            fillSelectControl(control, value);
            return;
        }

        if (tagName === "input") {
            const type = (control.type || "").toLowerCase();
            if (type === "checkbox") {
                fillCheckboxControl(control, value);
                return;
            }
            if (type === "radio") {
                fillRadioControl(control, value);
                return;
            }
        }

        fillTextControl(control, value);
    }

    async function requestDummyData(country, fields) {
        const payload = {
            country,
            fields: fields.join(","),
        };
        log("Requesting dummy data", payload);
        const response = await gmRequest({
            method: "POST",
            url: DUMMY_DATA_ENDPOINT,
            headers: {
                "Content-Type": "application/json",
            },
            data: JSON.stringify(payload),
        });
        const json = JSON.parse(response.responseText);
        if (!json.success) {
            throw new Error(json.message || "Dummy data request failed");
        }
        return json.result;
    }

    async function fillFormWithDummyData(country) {
        if (!Array.isArray(formElements) || formElements.length === 0) {
            throw new Error("No form elements available to fill");
        }

        const fields = formElements.map((element) => element.name).filter(Boolean);
        if (fields.length === 0) {
            throw new Error("No field names found in flow definition");
        }

        const resultText = await requestDummyData(country, fields);
        console.log(resultText);
        const valuesMap = parseKeyValueLines(resultText);

        for (const elementDef of formElements) {
            const fieldValue = valuesMap[elementDef.name];
            if (fieldValue === undefined) continue;
            const controls = findControlsForElement(elementDef);
            if (!controls.length) {
                log("No controls found for element", elementDef);
                continue;
            }
            for (const control of controls) {
                await fillControl(control, fieldValue, elementDef);
            }
        }
    }

    async function closeReactSelectMenu(control) {
        const input = control.querySelector("input") || document.activeElement || control;
        const eventInit = { key: "Escape", code: "Escape", bubbles: true, cancelable: true };
        for (const type of ["keydown", "keyup"]) {
            try {
                input.dispatchEvent(new KeyboardEvent(type, eventInit));
            } catch (error) {
                log("Failed to dispatch Escape event", error);
            }
        }
        if (input instanceof HTMLElement) {
            input.blur();
        }
        await delay(100);
    }

    async function collectCountryOptions() {
        const countryElementDef = formElements.find((element) => element.name === COUNTRY_FIELD_NAME);
        if (!countryElementDef) return [];

        const controls = findControlsForElement(countryElementDef);
        if (!controls.length) return [];

        const primaryControl = controls[0];
        let values = [];

        if (isReactSelectControl(primaryControl)) {
            const context = await openReactSelect(primaryControl);
            if (!context) return [];
            const { index, listbox } = context;
            const options = getReactSelectOptions(listbox, index);
            values = options
                .map((option) => option.textContent?.trim())
                .filter(Boolean);
            await closeReactSelectMenu(primaryControl);
        } else if (primaryControl instanceof HTMLSelectElement) {
            values = Array.from(primaryControl.options)
                .map((option) => option.textContent?.trim())
                .filter(Boolean);
        }

        const unique = Array.from(new Set(values));
        unique.sort((a, b) => a.localeCompare(b));
        return unique;
    }

    function createCountrySelectionModal(options, defaultValue) {
        return new Promise((resolve) => {
            const overlay = document.createElement("div");
            overlay.style.cssText = `
                position: fixed;
                inset: 0;
                background: rgba(0,0,0,0.45);
                backdrop-filter: blur(2px);
                z-index: 2147483646;
                display: flex;
                align-items: center;
                justify-content: center;
                font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
            `;
            overlay.tabIndex = -1;

            const modal = document.createElement("div");
            modal.style.cssText = `
                background: #fff;
                border-radius: 10px;
                width: min(420px, 90vw);
                max-height: 80vh;
                display: flex;
                flex-direction: column;
                padding: 20px;
                box-shadow: 0 18px 30px rgba(0,0,0,0.25);
            `;

            const title = document.createElement("h3");
            title.textContent = "Select Country";
            title.style.cssText = `
                margin: 0 0 12px;
                font-size: 18px;
                font-weight: 600;
                color: #1f2933;
            `;

            const searchInput = document.createElement("input");
            searchInput.type = "search";
            searchInput.placeholder = "Search…";
            searchInput.style.cssText = `
                padding: 8px 10px;
                border: 1px solid #d0d7de;
                border-radius: 6px;
                margin-bottom: 10px;
                font-size: 14px;
            `;

            const select = document.createElement("select");
            select.size = Math.min(options.length, 10) || 5;
            select.style.cssText = `
                width: 100%;
                flex: 1 1 auto;
                border: 1px solid #d0d7de;
                border-radius: 6px;
                font-size: 14px;
                padding: 6px;
                overflow-y: auto;
            `;

            const footer = document.createElement("div");
            footer.style.cssText = `
                display: flex;
                justify-content: flex-end;
                gap: 10px;
                margin-top: 16px;
            `;

            const cancelButton = document.createElement("button");
            cancelButton.textContent = "Cancel";
            cancelButton.style.cssText = `
                padding: 8px 14px;
                border: 1px solid #d0d7de;
                background: #fff;
                color: #374151;
                border-radius: 6px;
                cursor: pointer;
            `;

            const confirmButton = document.createElement("button");
            confirmButton.textContent = "Fill";
            confirmButton.style.cssText = `
                padding: 8px 14px;
                border: none;
                background: #2563eb;
                color: #fff;
                border-radius: 6px;
                cursor: pointer;
            `;

            function renderOptions(filterText = "") {
                const normalized = filterText.trim().toLowerCase();
                select.innerHTML = "";
                const filtered = [];
                if (normalized) {
                    for (const option of options) {
                        if (option.toLowerCase().includes(normalized)) {
                            filtered.push(option);
                        }
                    }
                } else {
                    filtered.push(...options);
                }
                const previousValue = select.value;
                for (const option of filtered) {
                    const optionEl = document.createElement("option");
                    optionEl.value = option;
                    optionEl.textContent = option;
                    select.appendChild(optionEl);
                }
                let preferred = null;
                if (filtered.includes(previousValue)) {
                    preferred = previousValue;
                } else if (defaultValue && filtered.includes(defaultValue)) {
                    preferred = defaultValue;
                } else if (filtered.length > 0) {
                    preferred = filtered[0];
                }
                if (preferred) {
                    select.value = preferred;
                }
            }

            function cleanup(result) {
                overlay.remove();
                resolve(result ?? null);
            }

            searchInput.addEventListener("input", () => {
                renderOptions(searchInput.value);
            });

            cancelButton.addEventListener("click", () => cleanup(null));

            confirmButton.addEventListener("click", () => {
                cleanup(select.value || null);
            });

            overlay.addEventListener("click", (event) => {
                if (event.target === overlay) {
                    cleanup(null);
                }
            });

            overlay.addEventListener("keydown", (event) => {
                if (event.key === "Escape") {
                    event.preventDefault();
                    cleanup(null);
                }
                if (event.key === "Enter" && event.target !== searchInput) {
                    event.preventDefault();
                    cleanup(select.value || null);
                }
            });

            renderOptions();

            footer.append(cancelButton, confirmButton);
            modal.append(title, searchInput, select, footer);
            overlay.appendChild(modal);
            document.body.appendChild(overlay);
            searchInput.focus();
        });
    }

    async function promptUserForCountry() {
        const options = await collectCountryOptions();
        if (options.length > 0) {
            return createCountrySelectionModal(options, countrySelection || options[0]);
        }
        const manual = globalThis.prompt("Enter country value", countrySelection || "");
        return manual?.trim() || null;
    }

    async function handleManualFill() {
        try {
            const selectedCountry = await promptUserForCountry();
            if (!selectedCountry) {
                return;
            }
            countrySelection = selectedCountry;
            await fillFormWithDummyData(selectedCountry);
        } catch (error) {
            console.error("Manual fill failed", error);
            alert("Manual fill failed: " + (error?.message || error));
        }
    }

    async function initialize() {
        try {
            await fetchFlowDefinition();
        } catch (error) {
            console.error("Workflow AutoCompleted initialization failed", error);
        }

        GM_registerMenuCommand("Workflow Auto Fill", handleManualFill);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initialize, { once: true });
    } else {
        initialize();
    }
})();


