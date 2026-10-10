const display = document.getElementById("main");
const sub = document.getElementById("sub");
const calc = document.getElementById("calc");
const historyPanel = document.getElementById("history");
const historyToggle = document.getElementById("history-toggle");
const historyList = document.getElementById("h-list");

const HISTORY_KEY = "calc_history";
const THEME_KEY = "calc_theme";
const MAX_LENGTH = 80;
const OPERATORS = ["+", "−", "×", "÷"];
const SYMBOL = { "-": "−", "*": "×", "/": "÷" };
const KEYMAP = { Enter: "=", "=": "=", Backspace: "back", Delete: "clear", Escape: "clear", x: "*", X: "*", ",": "." };

const state = { expr: "", prev: "", done: false, error: "" };
let history = loadHistory();

function loadHistory() {
    try {
        const list = JSON.parse(localStorage.getItem(HISTORY_KEY));
        return Array.isArray(list) ? list : [];
    } catch (error) {
        return [];
    }
}

function saveHistory() {
    try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    } catch (error) {
        console.error(error);
    }
}

function tokenize(text) {
    const tokens = [];
    let i = 0;
    while (i < text.length) {
        const c = text[i];
        if (/[\d.]/.test(c)) {
            let j = i;
            while (j < text.length && /[\d.]/.test(text[j])) {
                j++;
            }
            const piece = text.slice(i, j);
            if ((piece.match(/\./g) || []).length > 1 || piece === ".") {
                throw new Error("Invalid expression");
            }
            tokens.push({ t: "num", v: parseFloat(piece) });
            i = j;
        } else if ("+−×÷()%".includes(c)) {
            tokens.push({ t: c });
            i++;
        } else {
            throw new Error("Invalid expression");
        }
    }
    return tokens;
}

function evaluate(tokens) {
    let p = 0;
    const peek = () => (tokens[p] ? tokens[p].t : null);

    function primary() {
        const token = tokens[p];
        if (!token) {
            throw new Error("Invalid expression");
        }
        if (token.t === "num") {
            p++;
            return { v: token.v, pct: false };
        }
        if (token.t === "(") {
            p++;
            const inner = sum();
            if (peek() !== ")") {
                throw new Error("Invalid expression");
            }
            p++;
            return { v: inner, pct: false };
        }
        throw new Error("Invalid expression");
    }

    function postfix() {
        let node = primary();
        while (peek() === "%") {
            p++;
            node = { v: node.v / 100, pct: true };
        }
        return node;
    }

    function unary() {
        if (peek() === "−") {
            p++;
            const node = unary();
            return { v: -node.v, pct: node.pct };
        }
        if (peek() === "+") {
            p++;
            return unary();
        }
        return postfix();
    }

    function product() {
        let node = unary();
        while (peek() === "×" || peek() === "÷") {
            const op = tokens[p].t;
            p++;
            const right = unary();
            if (op === "×") {
                node = { v: node.v * right.v, pct: false };
            } else {
                if (right.v === 0) {
                    throw new Error("Cannot divide by zero");
                }
                node = { v: node.v / right.v, pct: false };
            }
        }
        return node;
    }

    function sum() {
        let value = product().v;
        while (peek() === "+" || peek() === "−") {
            const op = tokens[p].t;
            p++;
            const right = product();
            const amount = right.pct ? value * right.v : right.v;
            value = op === "+" ? value + amount : value - amount;
        }
        return value;
    }

    const result = sum();
    if (p < tokens.length) {
        throw new Error("Invalid expression");
    }
    return result;
}

function calculate(source) {
    let text = source.replace(/[+−×÷(]+$/, "");
    if (text === "") {
        return null;
    }
    const open = (text.match(/\(/g) || []).length;
    const close = (text.match(/\)/g) || []).length;
    text += ")".repeat(Math.max(0, open - close));
    return evaluate(tokenize(text));
}

function formatNumber(n) {
    if (!isFinite(n)) {
        throw new Error("Overflow");
    }
    const rounded = parseFloat(n.toPrecision(12));
    if (Math.abs(rounded) >= 1e15) {
        throw new Error("Number too large");
    }
    let text;
    if (rounded !== 0 && Math.abs(rounded) < 1e-6) {
        text = rounded.toFixed(15).replace(/0+$/, "").replace(/\.$/, "");
    } else {
        text = String(rounded);
    }
    return text.replace(/-/g, "−");
}

function group(text) {
    return text.replace(/\d+(\.\d+)?/g, (match) => {
        const parts = match.split(".");
        parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
        return parts.join(".");
    });
}

function hasOperation(expr) {
    return /[+−×÷%()]/.test(expr.replace(/^−/, ""));
}

function lastChar() {
    return state.expr.slice(-1);
}

function startFresh() {
    if (state.done) {
        state.expr = "";
        state.done = false;
    }
}

function digit(d) {
    startFresh();
    const last = lastChar();
    if (last === ")" || last === "%") {
        state.expr += "×";
    }
    const current = state.expr.match(/(\d+\.?\d*)$/);
    if (current && current[1] === "0") {
        state.expr = state.expr.slice(0, -1) + d;
        return;
    }
    if (current && current[1].replace(".", "").length >= 15) {
        return;
    }
    state.expr += d;
}

function dot() {
    startFresh();
    const last = lastChar();
    if (last === ")" || last === "%") {
        state.expr += "×";
    }
    const match = state.expr.match(/(\d*\.?\d*)$/);
    const current = match ? match[1] : "";
    if (current.includes(".")) {
        return;
    }
    state.expr += current === "" ? "0." : ".";
}

function operator(op) {
    state.done = false;
    if (state.expr === "") {
        if (op === "−") {
            state.expr = "−";
        }
        return;
    }
    const last = lastChar();
    if (last === "(") {
        if (op === "−") {
            state.expr += "−";
        }
        return;
    }
    if (last === "−" && (state.expr.length === 1 || state.expr.slice(-2, -1) === "(")) {
        return;
    }
    if (OPERATORS.includes(last)) {
        state.expr = state.expr.slice(0, -1) + op;
        return;
    }
    if (last === ".") {
        state.expr += "0";
    }
    state.expr += op;
}

function paren(k) {
    if (state.done) {
        if (k === "(" || k === "paren") {
            state.expr = "";
        }
        state.done = false;
    }
    const open = (state.expr.match(/\(/g) || []).length;
    const close = (state.expr.match(/\)/g) || []).length;
    const afterValue = /[\d)%.]$/.test(state.expr);
    let want = k;
    if (k === "paren") {
        want = open > close && afterValue ? ")" : "(";
    }
    if (want === ")") {
        if (open <= close || !afterValue) {
            return;
        }
        if (lastChar() === ".") {
            state.expr += "0";
        }
        state.expr += ")";
        return;
    }
    if (afterValue) {
        if (lastChar() === ".") {
            state.expr += "0";
        }
        state.expr += "×";
    }
    state.expr += "(";
}

function percent() {
    state.done = false;
    if (!/[\d)%]$/.test(state.expr)) {
        return;
    }
    state.expr += "%";
}

function negate() {
    state.done = false;
    const wrapped = state.expr.match(/\(−(\d+\.?\d*)\)$/);
    if (wrapped) {
        state.expr = state.expr.slice(0, wrapped.index) + wrapped[1];
        return;
    }
    const number = state.expr.match(/(\d+\.?\d*)$/);
    if (number) {
        state.expr = state.expr.slice(0, number.index) + "(−" + number[1] + ")";
    }
}

function backspace() {
    state.done = false;
    state.expr = state.expr.slice(0, -1);
}

function clearAll() {
    state.expr = "";
    state.prev = "";
    state.done = false;
    state.error = "";
}

function equals() {
    if (state.done || state.expr === "") {
        return;
    }
    try {
        const value = calculate(state.expr);
        if (value === null) {
            return;
        }
        const text = formatNumber(value);
        state.prev = state.expr;
        if (hasOperation(state.expr) && text !== state.expr) {
            addHistory(state.expr, text);
        }
        state.expr = text;
        state.done = true;
    } catch (error) {
        state.error = error.message;
    }
}

function press(k) {
    if (state.error) {
        state.error = "";
        state.expr = "";
        state.done = false;
        if (k === "clear" || k === "back" || k === "=") {
            render();
            return;
        }
    }
    const adds = /^[0-9.+\-*/()%]$/.test(k) || k === "paren";
    if (adds && !state.done && state.expr.length >= MAX_LENGTH) {
        return;
    }
    if (/^[0-9]$/.test(k)) {
        digit(k);
    } else if (k === ".") {
        dot();
    } else if (k === "+" || k === "-" || k === "*" || k === "/") {
        operator(SYMBOL[k] || k);
    } else if (k === "(" || k === ")" || k === "paren") {
        paren(k);
    } else if (k === "%") {
        percent();
    } else if (k === "neg") {
        negate();
    } else if (k === "back") {
        backspace();
    } else if (k === "clear") {
        clearAll();
    } else if (k === "=") {
        equals();
    }
    render();
}

function preview() {
    if (!hasOperation(state.expr)) {
        return "";
    }
    try {
        const value = calculate(state.expr);
        if (value === null) {
            return "";
        }
        const text = formatNumber(value);
        return text === state.expr ? "" : "= " + group(text);
    } catch (error) {
        return "";
    }
}

function fit() {
    display.style.fontSize = "";
    let size = parseFloat(getComputedStyle(display).fontSize);
    while (display.scrollWidth > display.clientWidth && size > 20) {
        size -= 2;
        display.style.fontSize = size + "px";
    }
    display.scrollLeft = display.scrollWidth;
}

function render() {
    if (state.error) {
        display.textContent = state.error;
        sub.textContent = "";
    } else if (state.done) {
        display.textContent = group(state.expr);
        sub.textContent = group(state.prev) + " =";
    } else {
        display.textContent = group(state.expr) || "0";
        sub.textContent = preview();
    }
    display.classList.toggle("error", Boolean(state.error));
    display.classList.toggle("done", state.done && !state.error);
    fit();
}

function addHistory(expr, result) {
    history.unshift({ expr: expr, result: result });
    history = history.slice(0, 40);
    saveHistory();
    renderHistory();
}

function renderHistory() {
    historyList.textContent = "";
    if (!history.length) {
        const empty = document.createElement("p");
        empty.className = "h-empty";
        empty.textContent = "No calculations yet";
        historyList.appendChild(empty);
        return;
    }
    history.forEach((entry) => {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "h-item";
        const expr = document.createElement("span");
        expr.className = "h-expr";
        expr.textContent = group(entry.expr) + " =";
        const result = document.createElement("span");
        result.className = "h-res";
        result.textContent = group(entry.result);
        item.append(expr, result);
        item.addEventListener("click", () => {
            state.error = "";
            state.expr = entry.result;
            state.prev = entry.expr;
            state.done = true;
            toggleHistory(false);
            render();
        });
        historyList.appendChild(item);
    });
}

function toggleHistory(force) {
    const open = typeof force === "boolean" ? force : !historyPanel.classList.contains("open");
    historyPanel.classList.toggle("open", open);
    historyPanel.inert = !open;
    historyToggle.setAttribute("aria-expanded", String(open));
    historyToggle.setAttribute("aria-label", open ? "Hide history" : "Show history");
    historyToggle.classList.toggle("active", open);
}

function flash(k) {
    const id = k === "(" || k === ")" ? "paren" : k;
    const button = calc.querySelector('.keys [data-k="' + id + '"], .back[data-k="' + id + '"]');
    if (!button) {
        return;
    }
    button.classList.add("flash");
    setTimeout(() => button.classList.remove("flash"), 120);
}

function initTheme() {
    let saved = null;
    try {
        saved = localStorage.getItem(THEME_KEY);
    } catch (error) {
        saved = null;
    }
    const light = window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches;
    document.documentElement.dataset.theme = saved || (light ? "light" : "dark");
}

function switchTheme() {
    const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    try {
        localStorage.setItem(THEME_KEY, next);
    } catch (error) {
        console.error(error);
    }
}

calc.addEventListener("click", (event) => {
    const button = event.target.closest("[data-k]");
    if (button) {
        press(button.dataset.k);
    }
});

historyToggle.addEventListener("click", () => toggleHistory());

document.getElementById("history-clear").addEventListener("click", () => {
    history = [];
    saveHistory();
    renderHistory();
});

document.getElementById("theme-toggle").addEventListener("click", switchTheme);

document.addEventListener("keydown", (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey) {
        return;
    }
    if (event.key === "Escape" && historyPanel.classList.contains("open")) {
        toggleHistory(false);
        return;
    }
    if (event.target.closest && event.target.closest(".top, .history")) {
        return;
    }
    const k = KEYMAP[event.key] || event.key;
    if (!/^([0-9.+\-*/()%]|=|back|clear)$/.test(k)) {
        return;
    }
    event.preventDefault();
    press(k);
    flash(k);
});

window.addEventListener("resize", fit);

initTheme();
renderHistory();
render();
