// === LOCALSTORAGE TRACKING (FULL AUTH) ===
const STORAGE_KEY = 'loveSyncAuth';

function saveAuth(id, password, username) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
        id,
        password,
        username,
        isLoggedIn: true
    }));
}

function getAuth() {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : null;
}

function clearAuth() {
    localStorage.removeItem(STORAGE_KEY);
}

// === SOCKET ===
let socket = null;
let tempPassword = null;

// === START APP ===
function initApp() {
    const auth = getAuth();

    if (auth && auth.isLoggedIn && auth.id && auth.password) {
        connectWithAuth(auth.id, auth.password);
    } else {
        promptLogin();
    }
}

// === PROMPT LOGIN ===
function promptLogin() {
    const id = prompt('Enter Login ID (betu or puchu):');
    if (!id || !id.trim()) return alert('ID required!'), promptLogin();

    const password = prompt('Enter Password:');
    if (!password || !password.trim()) return alert('Password required!'), promptLogin();

    connectWithAuth(id.trim(), password.trim());
}

// === CONNECT WITH FULL AUTHentication ===
function connectWithAuth(id, password) {
    tempPassword = password;

    socket = io('https://truthanddareserver.onrender.com/', {
        auth: { id, password },
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000
    });

    setupSocketEvents();
}

// === SOCKET EVENTS ===
function setupSocketEvents() {

    socket.on('connect', () => {
        console.log('Connected');
    });

    socket.on('init', (data) => {
        if (tempPassword) {
            saveAuth(data.currentUser.id, tempPassword, data.currentUser.username);
            tempPassword = null;
        }

        // UI Load — NO REFRESH
        updateList('dareList', data.dares, 'dare');
        updateList('truthList', data.truths, 'truth');
        updateChatMessages(data.messages);
        document.querySelector('#editSection h2').innerText = 
            `Your Dares & Truths (${data.currentUser.username})`;
    });

    socket.on('connect_error', (err) => {
        const auth = getAuth();
        if (!auth?.isLoggedIn) {
            alert('Login Failed!');
            clearAuth();
            promptLogin();
        }
    });

    socket.on('disconnect', () => {
        console.log('Reconnecting...');
    });

    // === ADD/EDIT/DELETE — NO REFRESH ===
    socket.on('updateOwnDares', (dares) => {
        updateListSmooth('dareList', dares, 'dare');  // ← SMOOTH UPDATE
    });
    socket.on('updateOwnTruths', (truths) => {
        updateListSmooth('truthList', truths, 'truth'); // ← SMOOTH UPDATE
    });

    // === CHAT NOTIFICATION — 10 SECONDS ===
    socket.on('newMessage', (msg) => {
        addMessageToChat(msg);
        showNotification('messageNotification', 10000); // ← 4 sec
    });

    socket.on('revealResult', (text) => {
        const result = document.getElementById('result');
        result.innerText = text;
        result.classList.remove('show');
        setTimeout(() => {
            result.classList.add('show');
            confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
        }, 8);
    });

    socket.on('revealNotification', (data) => {
        const notif = document.getElementById('revealNotification');
        notif.innerText = `${data.username} revealed: ${data.item}`;
        showNotification('revealNotification', 7000); // ← 8 sec
    });

    socket.on('clearChat', () => {
        document.getElementById('chatMessages').innerHTML = '';
    });

    socket.on('usernameUpdated', (newName) => {
        const auth = getAuth();
        if (auth && auth.password) {
            saveAuth(auth.id, auth.password, newName);
        }
        document.querySelector('#editSection h2').innerText = 
            `Your Dares & Truths (${newName})`;
    });

    socket.on('messagesUpdated', (messages) => {
        updateChatMessages(messages);
    });
}

// === SMOOTH UPDATE (NO REFRESH) ===
function updateListSmooth(elementId, items, type) {
    const ul = document.getElementById(elementId);
    const existing = new Map();

    // Existing items ko map karo
    Array.from(ul.children).forEach(li => {
        if (li.dataset.id) existing.set(li.dataset.id, li);
    });

    // Naye items add karo
    items.forEach(item => {
        if (!existing.has(item.id)) {
            const li = document.createElement('li');
            li.dataset.id = item.id;
            li.innerHTML = `
                <span>${escapeHtml(item.text)}</span>
                <div>
                    <button type="button" onclick="editItem('${type}', '${item.id}', '${escapeHtml(item.text)}')">Edit</button>
                    <button type="button" onclick="deleteItem('${type}', '${item.id}')">Delete</button>
                </div>
            `;
            ul.appendChild(li);
        } else {
            // Update text if changed
            const li = existing.get(item.id);
            li.querySelector('span').textContent = item.text;
            existing.delete(item.id);
        }
    });

    // Baaki delete karo
    existing.forEach(li => li.remove());
}

// === NORMAL UPDATE (INIT KE LIYE) ===
function updateList(elementId, items, type) {
    const ul = document.getElementById(elementId);
    ul.innerHTML = '';
    items.forEach(item => {
        const li = document.createElement('li');
        li.dataset.id = item.id;
        li.innerHTML = `
            <span>${item.text}</span>
            <div>
                <button type="button" onclick="editItem('${type}', '${item.id}', '${escapeHtml(item.text)}')">Edit</button>
                <button type="button" onclick="deleteItem('${type}', '${item.id}')">Delete</button>
            </div>
        `;
        ul.appendChild(li);
    });
}

// === BAQI SAB (Same) ===
function addDare() {
    const text = document.getElementById('dareInput').value.trim();
    if (text && getAuth()?.isLoggedIn) {
        socket.emit('addDare', text);
        document.getElementById('dareInput').value = '';
    }
}
function addTruth() {
    const text = document.getElementById('truthInput').value.trim();
    if (text && getAuth()?.isLoggedIn) {
        socket.emit('addTruth', text);
        document.getElementById('truthInput').value = '';
    }
}
function sendMessage() {
    const message = document.getElementById('chatInput').value.trim();
    if (message && getAuth()?.isLoggedIn) {
        socket.emit('sendMessage', message);
        document.getElementById('chatInput').value = '';
    }
}
function clearChat() {
    if (confirm('Clear all messages?') && getAuth()?.isLoggedIn) {
        socket.emit('clearChat');
    }
}
function editUsername() {
    const auth = getAuth();
    if (!auth?.isLoggedIn) return alert('Login first!');
    const newName = prompt('New username:', auth.username);
    if (newName && newName.trim()) {
        socket.emit('editUsername', newName.trim());
    }
}
function deleteItem(type, id) {
    if (getAuth()?.isLoggedIn) socket.emit('deleteItem', { type, id });
}
function editItem(type, id, oldText) {
    if (!getAuth()?.isLoggedIn) return;
    const newText = prompt(`Edit ${type}:`, oldText);
    if (newText && newText.trim()) {
        socket.emit('editItem', { type, id, newText: newText.trim() });
    }
}
function revealRandom() {
    if (getAuth()?.isLoggedIn) socket.emit('revealItem');
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function addMessageToChat(msg) {
    const div = document.createElement('div');
    div.className = 'message';
    div.innerHTML = `<span class="username">${msg.username}</span>: ${msg.message}`;
    const container = document.getElementById('chatMessages');
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

function updateChatMessages(messages) {
    const container = document.getElementById('chatMessages');
    container.innerHTML = '';
    messages.forEach(addMessageToChat);
}

// === NOTIFICATION — AB LAMBII ===
function showNotification(id, time = 10000) {  // ← 10 sec default
    const el = document.getElementById(id);
    el.classList.remove('hidden');
    clearTimeout(el.hideTimeout);
    el.hideTimeout = setTimeout(() => el.classList.add('hidden'), time);
}

function toggleEdit() {
    document.getElementById('editSection').classList.toggle('hidden');
}

function toggleDarkMode() {
    document.body.classList.toggle('dark-mode');
}

// === LOGOUT FUNCTION ===
function logout() {
    if (confirm('Logout karna hai?')) {
        // 1. localStorage clear
        clearAuth();

        // 2. Socket disconnect
        if (socket) {
            socket.disconnect();
            socket = null;
        }

        // 3. UI reset
        document.getElementById('dareList').innerHTML = '';
        document.getElementById('truthList').innerHTML = '';
        document.getElementById('chatMessages').innerHTML = '';
        document.getElementById('result').innerText = '';
        document.querySelector('#editSection h2').innerText = 'Your Dares & Truths';
        
        // 4. Phir se login prompt
        setTimeout(promptLogin, 500);
    }
}

// === ENTER KEY FIX FOR MOBILE + LAPTOP ===
function setupEnterKeyHandlers() {
    const inputs = ['dareInput', 'truthInput', 'chatInput'];
    
    inputs.forEach(id => {
        const input = document.getElementById(id);
        if (!input) return;

        input.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();

                if (id === 'dareInput') addDare();
                else if (id === 'truthInput') addTruth();
                else if (id === 'chatInput') sendMessage();

                // Fix for mobile: blur + refocus
                this.blur();
                setTimeout(() => this.focus(), 100);
            }
        });
    });
}

document.addEventListener('DOMContentLoaded', setupEnterKeyHandlers);

window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        const auth = getAuth();
        if (auth && auth.isLoggedIn && socket) {
            if (!socket.connected) {
                // console.log('🔁 Tab reopened — reconnecting to server...');
                socket.connect();
            } else {
                // console.log('🔄 Tab reopened — refreshing data...');
                socket.emit('requestFreshData'); // backend se latest data mangwa lo
            }
        }
    }
});

// === START ===
initApp();
