# app.py - Flask 后端，提供 API 和数据存储
import os
import json
from datetime import datetime, date
from flask import Flask, render_template, request, jsonify

app = Flask(__name__)

# 数据文件路径
DATA_DIR = 'data'
DATA_FILE = os.path.join(DATA_DIR, 'data.json')

# 确保 data 目录存在
os.makedirs(DATA_DIR, exist_ok=True)

def read_data():
    """读取数据文件，若不存在则返回默认结构"""
    if not os.path.exists(DATA_FILE):
        default = {"tasks": [], "sessions": []}
        write_data(default)
        return default
    with open(DATA_FILE, 'r', encoding='utf-8') as f:
        return json.load(f)

def write_data(data):
    """写入数据文件"""
    with open(DATA_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

# ========== 页面路由 ==========
@app.route('/')
def index():
    """返回前端页面"""
    return render_template('index.html')

# ========== 任务 API ==========
@app.route('/api/tasks', methods=['GET'])
def get_tasks():
    """获取所有任务"""
    data = read_data()
    return jsonify(data.get('tasks', []))

@app.route('/api/tasks', methods=['POST'])
def add_task():
    """添加新任务"""
    req = request.get_json()
    text = req.get('text', '').strip()
    if not text:
        return jsonify({'error': '任务内容不能为空'}), 400

    data = read_data()
    tasks = data.get('tasks', [])
    # 生成简单递增 ID
    new_id = max([t['id'] for t in tasks], default=0) + 1
    new_task = {
        'id': new_id,
        'text': text,
        'completed': False
    }
    tasks.append(new_task)
    data['tasks'] = tasks
    write_data(data)
    return jsonify(new_task), 201

@app.route('/api/tasks/<int:task_id>', methods=['PUT'])
def toggle_task(task_id):
    """切换任务完成状态"""
    data = read_data()
    tasks = data.get('tasks', [])
    for task in tasks:
        if task['id'] == task_id:
            task['completed'] = not task['completed']
            write_data(data)
            return jsonify(task)
    return jsonify({'error': '任务不存在'}), 404

@app.route('/api/tasks/<int:task_id>', methods=['DELETE'])
def delete_task(task_id):
    """删除任务"""
    data = read_data()
    tasks = data.get('tasks', [])
    new_tasks = [t for t in tasks if t['id'] != task_id]
    if len(new_tasks) == len(tasks):
        return jsonify({'error': '任务不存在'}), 404
    data['tasks'] = new_tasks
    write_data(data)
    return jsonify({'success': True})

# ========== 历史与统计 API ==========
@app.route('/api/history', methods=['GET'])
def get_history():
    """获取今日专注记录统计"""
    data = read_data()
    sessions = data.get('sessions', [])
    today_str = date.today().isoformat()  # 格式：2026-04-25

    # 筛选今日的专注会话
    today_focus = [s for s in sessions
                   if s['type'] == 'focus' and s['timestamp'][:10] == today_str]

    count = len(today_focus)
    total_minutes = sum(s['duration'] for s in today_focus)

    # 返回所有会话用于日志展示（近10条）
    recent = sorted(sessions, key=lambda x: x['timestamp'], reverse=True)[:10]

    return jsonify({
        'today_count': count,
        'today_minutes': total_minutes,
        'recent_sessions': recent
    })

@app.route('/api/history', methods=['POST'])
def add_session():
    """记录一次完成的专注或休息（前端在计时结束后调用）"""
    req = request.get_json()
    session_type = req.get('type', 'focus')      # focus / short_break / long_break
    duration = req.get('duration', 25)           # 分钟

    data = read_data()
    sessions = data.get('sessions', [])
    session = {
        'type': session_type,
        'duration': duration,
        'timestamp': datetime.now().isoformat()
    }
    sessions.append(session)
    data['sessions'] = sessions
    write_data(data)

    # 计算今日统计并返回
    today_str = date.today().isoformat()
    today_focus = [s for s in sessions
                   if s['type'] == 'focus' and s['timestamp'][:10] == today_str]
    count = len(today_focus)
    total_minutes = sum(s['duration'] for s in today_focus)
    return jsonify({
        'today_count': count,
        'today_minutes': total_minutes
    })

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)