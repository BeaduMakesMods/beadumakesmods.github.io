// =============================
// LAN Chat App - Stable Version
// Features: sound, unread dot, desktop notifications
// =============================

let currentChannel = "Channel #1";
let lastMessageCounts = {};  // Tracks last number of messages per channel
let messageCounts = {};      // Tracks total messages per channel

const channelListEl = document.getElementById("channelList");
const messagesEl = document.getElementById("messages");
const channelTitleEl = document.getElementById("channelTitle");
const addChannelBtn = document.getElementById("addChannelBtn");
const nameInput = document.getElementById("nameInput");
const messageInput = document.getElementById("messageInput");
const fileInput = document.getElementById("fileInput");
const sendForm = document.getElementById("sendForm");

// -----------------------------
// Notifications Setup
// -----------------------------
if ("Notification" in window && Notification.permission !== "granted") {
    Notification.requestPermission().then(p => console.log("Notification permission:", p));
}

// -----------------------------
// Load & Render Channels
// -----------------------------
async function getChannels() {
    const r = await fetch("/api/channels");
    return await r.json();
}

async function renderChannels() {
    const channels = await getChannels();
    channelListEl.innerHTML = "";

    channels.forEach(name => {
        const li = document.createElement("li");
        li.className = "channel-item" + (name === currentChannel ? " active" : "");
        li.dataset.channel = name;

        const span = document.createElement("span");
        span.textContent = name;
        span.className = "channel-name";
        span.title = "Double click to rename";

        li.onclick = () => selectChannel(name);

        span.ondblclick = async (ev) => {
            ev.stopPropagation();
            const newName = prompt("Rename channel:", name);
            if (newName && newName.trim()) {
                await fetch("/api/rename_channel", {
                    method: "POST",
                    headers: {"Content-Type":"application/json"},
                    body: JSON.stringify({old: name, new: newName.trim()})
                });
                currentChannel = newName.trim();
                await reloadAll();
            }
        };

        li.appendChild(span);

        // Add unread dot if needed
        if (lastMessageCounts[name] && lastMessageCounts[name] < (messageCounts[name] || 0) && name !== currentChannel) {
            li.classList.add("unread");
        }

        channelListEl.appendChild(li);
    });
}

// -----------------------------
// Load Messages
// -----------------------------
async function loadMessages() {
    const r = await fetch(`/api/messages/${encodeURIComponent(currentChannel)}`);
    const list = await r.json();

    const prevCount = messageCounts[currentChannel] || 0;

    messagesEl.innerHTML = "";
    list.forEach(m => {
        const div = document.createElement("div");
        div.className = "msg";

        const meta = document.createElement("div");
        meta.className = "meta";
        meta.textContent = `${m.name} • ${new Date(m.time).toLocaleString()}`;

        const text = document.createElement("div");
        text.className = "text";
        text.textContent = m.message || "";

        div.appendChild(meta);
        div.appendChild(text);

        if(m.file){
            const a = document.createElement("a");
            a.className = "file-link";
            a.href = `/uploads/${encodeURIComponent(m.file)}`;
            a.textContent = m.file.replace(/^[0-9_]+_/, '');
            a.target = "_blank";
            div.appendChild(a);
        }

        messagesEl.appendChild(div);
    });

    messagesEl.scrollTop = messagesEl.scrollHeight;

    // -----------------------------
    // Sound + Notifications
    // -----------------------------
    if(list.length > prevCount && prevCount !== 0){
        // Play sound
        const audio = new Audio("/static/ding.mp3");
        audio.play().catch(e => console.log("Audio blocked", e));

        // Desktop notification
        if ("Notification" in window && Notification.permission === "granted") {
            const latestMsg = list[list.length - 1];
            if(latestMsg.name !== (nameInput.value || "Anonymous")){
                new Notification(`${latestMsg.name} in ${currentChannel}`, {
                    body: latestMsg.message || "(file)",
                    icon: "/static/icon.png"  // optional
                });
            }
        }
    }

    messageCounts[currentChannel] = list.length;
    lastMessageCounts[currentChannel] = list.length;

    await renderChannels();
}

// -----------------------------
// Select Channel
// -----------------------------
async function selectChannel(name) {
    currentChannel = name;
    channelTitleEl.textContent = name;
    lastMessageCounts[name] = messageCounts[name] || 0;
    await loadMessages();
}

// -----------------------------
// Send Message
// -----------------------------
sendForm.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const form = new FormData();
    form.append("name", nameInput.value || "Anonymous");
    form.append("message", messageInput.value || "");
    if(fileInput.files.length > 0){
        form.append("file", fileInput.files[0]);
    }

    await fetch(`/api/send/${encodeURIComponent(currentChannel)}`, { method: "POST", body: form });
    messageInput.value = "";
    fileInput.value = "";
    await loadMessages();
});

// -----------------------------
// Add Channel
// -----------------------------
addChannelBtn.addEventListener("click", async () => {
    const r = await fetch("/api/add_channel", { method: "POST" });
    const data = await r.json();
    await reloadAll();
    selectChannel(data.name);
});

// -----------------------------
// Reload All
// -----------------------------
async function reloadAll() {
    await renderChannels();
    await loadMessages();
}

// -----------------------------
// Polling Loop
// -----------------------------
setInterval(loadMessages, 1500);

// -----------------------------
// Initial load
// -----------------------------
(async () => {
    await reloadAll();
})();
