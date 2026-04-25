// 番茄Todo - 前端核心逻辑

// ========== 全局状态 ==========
const TIMER_MODES = {
    focus: { minutes: 25, next: 'shortBreak' },
    shortBreak: { minutes: 5, next: 'focus' },
    longBreak: { minutes: 15, next: 'focus' }
};

let currentMode = 'focus';
let timerSeconds = 25 * 60;
let timerInterval = null;
let isRunning = false;
let focusCountToday = 0;  // 从后端获取的今日专注次数

// ========== DOM元素 ==========
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

// 通用 Toast 提示
function showToast(msg, isError = false) {
    // 移除已有 toast
    const old = document.querySelector('.toast-msg');
    if (old) old.remove();

    const toast = document.createElement('div');
    toast.className = 'toast-msg';
    toast.textContent = msg;
    toast.style.backgroundColor = isError ? '#e74c3c' : '#2ecc71';
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// Web Audio 提示音
function playAlert() {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const notes = [880, 1100, 1320];
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

// 浏览器通知
function showNotification(title, body) {
    if (Notification.permission === 'granted') {
        new Notification(title, { body });
    } else if (Notification.permission === 'default') {
        Notification.requestPermission().then(perm => {
            if (perm === 'granted') new Notification(title, { body });
        });
    }
}

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
    // 根据当前模式选择下一个模式（不增加专注计数）
    let nextMode;
    if (currentMode === 'focus') {
        nextMode = 'shortBreak';
    } else {
        nextMode = 'focus';  // 所有休息结束后回到专注
    }
    switchMode(nextMode);
}

function switchMode(mode) {
    currentMode = mode;
    timerSeconds = TIMER_MODES[mode].minutes * 60;
    updateDisplay();
    modeBtns.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === mode);
    });
    pauseTimer();
}

// 计时结束处理
async function handleTimerEnd() {
    playAlert();
    showToast(`⏰ ${currentMode === 'focus' ? '专注' : '休息'}时间结束！`);
    showNotification('番茄钟', `您的${currentMode === 'focus' ? '专注' : '休息'}时段已完成`);

    const duration = TIMER_MODES[currentMode].minutes;
    try {
        const res = await fetch('/api/history', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: currentMode, duration })
        });
        if (res.ok) {
            const data = await res.json();
            if (currentMode === 'focus') {
                focusCountToday = data.today_count;
            }
            updateStats(data.today_count, data.today_minutes);
            loadHistory();  // 刷新近期记录
        }
    } catch (e) {
        console.error('记录会话失败:', e);
    }
}

// ========== UI交互绑定 ==========
startPauseBtn.addEventListener('click', () => {
    if (isRunning) pauseTimer();
    else startTimer();
});

resetBtn.addEventListener('click', resetTimer);
skipBtn.addEventListener('click', skipToNext);

modeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        const mode = btn.dataset.mode;
        if (mode !== currentMode) switchMode(mode);
    });
});

// ========== 任务 CRUD + 刷新列表（修复重点） ==========
async function loadTasks() {
    try {
        const res = await fetch('/api/tasks');
        if (!res.ok) throw new Error('网络错误');
        const tasks = await res.json();
        renderTasks(tasks);
    } catch (e) {
        console.error('加载任务失败', e);
        showToast('加载任务失败', true);
    }
}

function renderTasks(tasks) {
    taskList.innerHTML = '';
    if (tasks.length === 0) {
        taskList.innerHTML = '<li class="task-item" style="justify-content:center; color:#999;">还没有任务，赶快添加吧~</li>';
        return;
    }
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

    // 绑定完成切换事件
    document.querySelectorAll('.task-checkbox').forEach(cb => {
        cb.addEventListener('change', async (e) => {
            const id = e.target.dataset.id;
            await toggleTask(id);
            loadTasks();   // 重新渲染列表保证状态一致
        });
    });

    // 绑定删除事件
    document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id = e.target.dataset.id;
            await deleteTask(id);
            loadTasks();
        });
    });
}

async function addTask(text) {
    try {
        const res = await fetch('/api/tasks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text })
        });
        if (res.ok) {
            showToast('✅ 任务已添加');
            await loadTasks();   // 等待刷新完成
        } else {
            const err = await res.json();
            showToast('添加失败：' + (err.error || '未知错误'), true);
        }
    } catch (e) {
        console.error('添加任务失败', e);
        showToast('添加失败，请重试', true);
    }
}

async function toggleTask(id) {
    try {
        const res = await fetch(`/api/tasks/${id}`, { method: 'PUT' });
        if (!res.ok) {
            const err = await res.json();
            showToast('操作失败：' + err.error, true);
        }
    } catch (e) {
        console.error('切换任务状态失败', e);
    }
}

async function deleteTask(id) {
    try {
        const res = await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
        if (res.ok) {
            showToast('🗑️ 任务已删除');
        } else {
            const err = await res.json();
            showToast('删除失败：' + err.error, true);
        }
    } catch (e) {
        console.error('删除任务失败', e);
    }
}

// 输入框添加任务
addTaskBtn.addEventListener('click', () => {
    const text = taskInput.value.trim();
    if (!text) {
        showToast('请输入任务内容', true);
        return;
    }
    addTask(text);
    taskInput.value = '';
});

taskInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addTaskBtn.click();
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
        if (!res.ok) throw new Error('网络错误');
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
    if (Notification.permission === 'default') {
        Notification.requestPermission();
    }
    await loadTasks();
    await loadHistory();
    switchMode('focus');
}

init();