"""
番茄Todo - Flask 后端
提供任务增删改查、计时历史记录 API
数据存储于本地 JSON 文件
"""
import os
import json
from datetime import datetime, date
from flask import Flask, render_template, request, jsonify

app = Flask(__name__)

DATA_DIR = 'data'
DATA_FILE = os.path.join(DATA_DIR, 'data.json')

# 确保数据目录存在
os.makedirs(DATA_DIR, exist_ok=True)


def read_data():
    """读取 JSON 数据，若文件不存在则创建默认结构"""
    if not os.path.exists(DATA_FILE):
        default = {"tasks": [], "sessions": []}
        write_data(default)
        return default
    with open(DATA_FILE, 'r', encoding='utf-8') as f:
        return json.load(f)


def write_data(data):
    """将数据写入 JSON 文件"""
    with open(DATA_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


# ==================== 页面路由 ====================
@app.route('/')
def index():
    return render_template('index.html')


# ==================== 任务 API ====================
@app.route('/api/tasks', methods=['GET'])
def get_tasks():
    """返回所有任务"""
    data = read_data()
    tasks = data.get('tasks', [])
    return jsonify(tasks)


@app.route('/api/tasks', methods=['POST'])
def add_task():
    """新增任务"""
    req = request.get_json()
    text = req.get('text', '').strip()
    if not text:
        return jsonify({'error': '任务内容不能为空'}), 400

    data = read_data()
    tasks = data.get('tasks', [])
    # 生成自增 ID
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


# ==================== 历史与统计 API ====================
@app.route('/api/history', methods=['GET'])
def get_history():
    """获取今日统计和近期会话"""
    data = read_data()
    sessions = data.get('sessions', [])
    today_str = date.today().isoformat()

    today_focus = [s for s in sessions
                   if s['type'] == 'focus' and s['timestamp'][:10] == today_str]
    count = len(today_focus)
    total_minutes = sum(s['duration'] for s in today_focus)

    # 取最近 10 条记录
    recent = sorted(sessions, key=lambda x: x['timestamp'], reverse=True)[:10]
    return jsonify({
        'today_count': count,
        'today_minutes': total_minutes,
        'recent_sessions': recent
    })


@app.route('/api/history', methods=['POST'])
def add_session():
    """添加一条会话记录（计时结束时调用）"""
    req = request.get_json()
    session_type = req.get('type', 'focus')
    duration = req.get('duration', 25)

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

    # 返回最新今日统计
    today_str = date.today().isoformat()
    today_focus = [s for s in sessions
                   if s['type'] == 'focus' and s['timestamp'][:10] == today_str]
    count = len(today_focus)
    total_minutes = sum(s['duration'] for s in today_focus)
    return jsonify({'today_count': count, 'today_minutes': total_minutes})


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)