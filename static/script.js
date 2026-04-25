// script.js - 前端核心逻辑
// ========== 全局状态 ==========
const TIMER_MODES = {
    focus: { minutes: 25, next: 'shortBreak' },
    shortBreak: { minutes: 5, next: 'focus' },
    longBreak: { minutes: 15, next: 'focus' }
};

let currentMode = 'focus';              // 当前模式
let timerSeconds = 25 * 60;            // 剩余秒数
let timerInterval = null;              // setInterval ID
let isRunning = false;                 // 是否正在计时
let focusCountToday = 0;               // 今日专注次数（用于跳过逻辑）

// ========== DOM 元素 ==========
const timerDisplay = document.getElementById('timerDisplay');
const startPauseBtn = document.getElementById('startPauseBtn');
const resetBtn = document.getElementById('resetBtn');
const skipBtn = document.getElementById('skipBtn');
const modeBtns = document.querySelectorAll('.mode-btn');

const taskInput = document.getElementById('taskInput');
const addTaskBtn = document.getElementById('addTaskBtn');
const taskList = document.getElementById('taskList');

const todayCountEl = document.getElementById('todayCount');
const todayMinutesEl = document.getElementById('todayMinutes');
const historyList = document.getElementById('historyList');

// ========== 工具函数 ==========
function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function updateDisplay() {
    timerDisplay.textContent = formatTime(timerSeconds);
}

// 播放提示音（使用 Web Audio API）
function playAlert() {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        // 简单的三音旋律
        const notes = [880, 1100, 1320]; // 频率 A5, C#6, E6
        notes.forEach((freq, i) => {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'sine';
            osc.frequency.value = freq;
            gain.gain.setValueAtTime(0.3, audioCtx.currentTime + i * 0.15);
            gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + i * 0.15 + 0.3);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start(audioCtx.currentTime + i * 0.15);
            osc.stop(audioCtx.currentTime + i * 0.15 + 0.3);
        });
    } catch (e) {
        console.warn('音频播放失败:', e);
    }
}

// 浏览器通知 (需要用户授权)
function showNotification(title, body) {
    if (Notification.permission === 'granted') {
        new Notification(title, { body });
    } else if (Notification.permission === 'default') {
        Notification.requestPermission().then(perm => {
            if (perm === 'granted') {
                new Notification(title, { body });
            }
        });
    }
}

// 页面内弹窗提示（避免过于干扰，使用顶部浮动消息）
function showToast(msg) {
    // 移除已有 toast
    const old = document.querySelector('.toast-msg');
    if (old) old.remove();
    const toast = document.createElement('div');
    toast.className = 'toast-msg';
    toast.textContent = msg;
    toast.style.cssText = `
        position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
        background: #e74c3c; color: white; padding: 12px 30px;
        border-radius: 40px; font-size: 1.2em; box-shadow: 0 5px 15px rgba(0,0,0,0.2);
        z-index: 999; animation: fadeInOut 3s forwards;
    `;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// 添加动画样式
const styleSheet = document.createElement('style');
styleSheet.textContent = `
    @keyframes fadeInOut {
        0% { opacity: 0; transform: translateX(-50%) translateY(-10px); }
        10% { opacity: 1; transform: translateX(-50%) translateY(0); }
        90% { opacity: 1; transform: translateX(-50%) translateY(0); }
        100% { opacity: 0; transform: translateX(-50%) translateY(-10px); }
    }
`;
document.head.appendChild(styleSheet);

// ========== 计时器核心逻辑 ==========
function startTimer() {
    if (isRunning) return;
    isRunning = true;
    startPauseBtn.textContent = '暂停';
    timerInterval = setInterval(() => {
        timerSeconds--;
        updateDisplay();
        if (timerSeconds <= 0) {
            clearInterval(timerInterval);
            timerInterval = null;
            isRunning = false;
            startPauseBtn.textContent = '开始';
            // 计时结束处理
            handleTimerEnd();
        }
    }, 1000);
}

function pauseTimer() {
    if (!isRunning) return;
    clearInterval(timerInterval);
    timerInterval = null;
    isRunning = false;
    startPauseBtn.textContent = '开始';
}

function resetTimer() {
    pauseTimer();
    timerSeconds = TIMER_MODES[currentMode].minutes * 60;
    updateDisplay();
}

function skipToNext() {
    pauseTimer();
    let nextMode;
    // 根据当前模式及今日专注次数决定下一个模式
    if (currentMode === 'focus') {
        // 专注后：每完成4个专注→长休息，否则短休息
        // 注意：下个模式仅用于设置，不增加 focusCountToday
        let nextFocusCount = focusCountToday + 1; // 假设本次专注已完成？但跳过时可能未完成，保持不变
        // 实际上这里的逻辑是：用户跳过当前时段，不记录专注完成，所以不增加计数
        // 按传统规则：完成一个 focus 后应进入 break；跳过时视为放弃，但仍切换到合理的下一个模式
        // 简化处理：跳过专注→短休息（不增加计数）
        nextMode = 'shortBreak';
    } else if (currentMode === 'shortBreak') {
        nextMode = 'focus';
    } else if (currentMode === 'longBreak') {
        nextMode = 'focus';
    } else {
        nextMode = 'focus';
    }
    switchMode(nextMode);
}

function switchMode(mode) {
    currentMode = mode;
    timerSeconds = TIMER_MODES[mode].minutes * 60;
    updateDisplay();
    // 更新模式按钮激活状态
    modeBtns.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === mode);
    });
    // 停止计时
    pauseTimer();
}

// 计时结束处理
async function handleTimerEnd() {
    playAlert();
    showToast(`⏰ ${currentMode === 'focus' ? '专注' : '休息'}时间结束！`);
    showNotification('番茄钟', `您的${currentMode === 'focus' ? '专注' : '休息'}时段已完成`);

    // 记录到后端
    const duration = TIMER_MODES[currentMode].minutes;
    try {
        const res = await fetch('/api/history', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: currentMode, duration })
        });
        if (res.ok) {
            const data = await res.json();
            // 更新今日统计（无论类型，但部分可能只关心专注统计）
            if (currentMode === 'focus') {
                focusCountToday = data.today_count;
            }
            updateStats(data.today_count, data.today_minutes);
            loadHistory();  // 刷新近期记录
        }
    } catch (e) {
        console.error('记录失败:', e);
    }

    // 不自动跳转，等待用户操作
}

// ========== UI交互 ==========
startPauseBtn.addEventListener('click', () => {
    if (isRunning) {
        pauseTimer();
    } else {
        startTimer();
    }
});

resetBtn.addEventListener('click', resetTimer);

skipBtn.addEventListener('click', skipToNext);

modeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        const mode = btn.dataset.mode;
        if (mode !== currentMode) {
            switchMode(mode);
        }
    });
});

// ========== 任务管理 ==========
async function loadTasks() {
    try {
        const res = await fetch('/api/tasks');
        const tasks = await res.json();
        renderTasks(tasks);
    } catch (e) {
        console.error('加载任务失败', e);
    }
}

function renderTasks(tasks) {
    taskList.innerHTML = '';
    tasks.forEach(task => {
        const li = document.createElement('li');
        li.className = 'task-item';
        li.innerHTML = `
            <input type="checkbox" class="task-checkbox" ${task.completed ? 'checked' : ''} data-id="${task.id}">
            <span class="task-text ${task.completed ? 'completed' : ''}">${escapeHtml(task.text)}</span>
            <button class="delete-btn" data-id="${task.id}">🗑️</button>
        `;
        taskList.appendChild(li);
    });

    // 绑定事件
    document.querySelectorAll('.task-checkbox').forEach(cb => {
        cb.addEventListener('change', async (e) => {
            const id = e.target.dataset.id;
            await toggleTask(id);
            loadTasks(); // 刷新列表
        });
    });

    document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id = e.target.dataset.id;
            await deleteTask(id);
            loadTasks();
        });
    });
}

async function addTask(text) {
    await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
    });
    loadTasks();
}

async function toggleTask(id) {
    await fetch(`/api/tasks/${id}`, { method: 'PUT' });
}

async function deleteTask(id) {
    await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
}

addTaskBtn.addEventListener('click', () => {
    const text = taskInput.value.trim();
    if (text) {
        addTask(text);
        taskInput.value = '';
    }
});

taskInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        addTaskBtn.click();
    }
});

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ========== 历史统计 ==========
async function loadHistory() {
    try {
        const res = await fetch('/api/history');
        const data = await res.json();
        updateStats(data.today_count, data.today_minutes);
        renderRecentSessions(data.recent_sessions);
    } catch (e) {
        console.error('加载历史失败', e);
    }
}

function updateStats(count, minutes) {
    todayCountEl.textContent = count;
    todayMinutesEl.textContent = minutes;
    // 更新全局变量（用于跳过逻辑）
    focusCountToday = count;
}

function renderRecentSessions(sessions) {
    historyList.innerHTML = '';
    if (!sessions || sessions.length === 0) {
        historyList.innerHTML = '<li class="history-item">暂无记录</li>';
        return;
    }
    sessions.forEach(s => {
        const li = document.createElement('li');
        li.className = 'history-item';
        const typeMap = { focus: '🍅 专注', shortBreak: '☕ 短休息', longBreak: '🛌 长休息' };
        const typeName = typeMap[s.type] || s.type;
        const time = new Date(s.timestamp).toLocaleTimeString('zh-CN', { hour12: false });
        li.textContent = `${typeName} · ${s.duration}分钟 · ${time}`;
        historyList.appendChild(li);
    });
}

// ========== 初始化 ==========
async function init() {
    // 请求通知权限（静默）
    if (Notification.permission === 'default') {
        Notification.requestPermission();
    }
    await loadTasks();
    await loadHistory();
    // 设置默认模式显示
    switchMode('focus');
}

init();