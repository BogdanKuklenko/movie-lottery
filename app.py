# app.py

import os
import json
import random
import re
import string
import time
import requests
from flask import Flask, render_template, request, jsonify, url_for
from datetime import datetime
from werkzeug.middleware.proxy_fix import ProxyFix
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy.exc import ProgrammingError
# --- НОВОЕ: Импорт для работы с qBittorrent ---
from qbittorrentapi import Client, LoginFailed

# --- Конфигурация ---
app = Flask(__name__)
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1, x_prefix=1)

db_uri = os.environ.get('DATABASE_URL')
if db_uri and db_uri.startswith("postgres://"):
    db_uri = db_uri.replace("postgres://", "postgresql://", 1)
app.config['SQLALCHEMY_DATABASE_URI'] = db_uri
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db = SQLAlchemy(app)

# --- НОВОЕ: Конфигурация для qBittorrent ---
# Важно: Эти данные нужно будет заменить на ваши реальные данные от Web-интерфейса qBittorrent
# Их лучше хранить в переменных окружения на хостинге Render для безопасности
QBIT_HOST = os.environ.get('QBIT_HOST', 'YOUR_QBITTORRENT_IP_HERE')
QBIT_PORT = os.environ.get('QBIT_PORT', '8080')
QBIT_USERNAME = os.environ.get('QBIT_USERNAME', 'admin')
QBIT_PASSWORD = os.environ.get('QBIT_PASSWORD', 'adminadmin')

# --- Модели Данных (без изменений) ---
class Lottery(db.Model):
    id = db.Column(db.String(6), primary_key=True)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    result_name = db.Column(db.String(200), nullable=True)
    result_poster = db.Column(db.String(500), nullable=True)
    result_year = db.Column(db.String(10), nullable=True)
    movies = db.relationship('Movie', backref='lottery', lazy=True, cascade="all, delete-orphan")

class Movie(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(200), nullable=False)
    poster = db.Column(db.String(500), nullable=True)
    year = db.Column(db.String(10), nullable=False)
    lottery_id = db.Column(db.String(6), db.ForeignKey('lottery.id'), nullable=False)

class BackgroundPhoto(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    poster_url = db.Column(db.String(500), unique=True, nullable=False)
    pos_top = db.Column(db.Float, nullable=False)
    pos_left = db.Column(db.Float, nullable=False)
    rotation = db.Column(db.Integer, nullable=False)
    z_index = db.Column(db.Integer, nullable=False)
    added_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

# --- Вспомогательные функции (без изменений) ---
def get_movie_data_from_kinopoisk(query):
    headers = {"X-API-KEY": os.environ.get('KINOPOISK_API_TOKEN')}
    params = {}
    kinopoisk_id_match = re.search(r'kinopoisk\.ru/(?:film|series)/(\d+)/', query)
    if kinopoisk_id_match:
        movie_id = kinopoisk_id_match.group(1)
        search_url = f"https://api.kinopoisk.dev/v1.4/movie/{movie_id}"
    else:
        search_url = "https://api.kinopoisk.dev/v1.4/movie/search"
        params['query'] = query
        params['limit'] = 1
    try:
        response = requests.get(search_url, headers=headers, params=params)
        response.raise_for_status()
        data = response.json()
        if 'docs' in data and data['docs']: movie = data['docs'][0]
        elif 'id' in data: movie = data
        else: return None
        return { "name": movie.get('name', 'Название не найдено'), "poster": movie.get('poster', {}).get('url'), "year": movie.get('year', '') }
    except requests.exceptions.RequestException as e:
        print(f"Ошибка при запросе к API Кинопоиска: {e}")
        return None

def generate_unique_id(length=6):
    while True:
        lottery_id = ''.join(random.choices(string.ascii_lowercase + string.digits, k=length))
        if not Lottery.query.get(lottery_id):
            return lottery_id

def get_background_photos():
    try:
        photos = BackgroundPhoto.query.order_by(BackgroundPhoto.added_at.desc()).limit(20).all()
        return [{"poster_url": p.poster_url, "pos_top": p.pos_top, "pos_left": p.pos_left, "rotation": p.rotation, "z_index": p.z_index} for p in photos]
    except ProgrammingError:
        return []

# --- Маршруты (без изменений) ---
@app.route('/')
def index():
    background_photos = get_background_photos()
    return render_template('index.html', background_photos=background_photos)

@app.route('/fetch-movie', methods=['POST'])
def get_movie_info():
    query = request.json.get('query')
    if not query: return jsonify({"error": "Пустой запрос"}), 400
    movie_data = get_movie_data_from_kinopoisk(query)
    if movie_data: return jsonify(movie_data)
    else: return jsonify({"error": "Фильм не найден"}), 404

@app.route('/create', methods=['POST'])
def create_lottery():
    movies_json = request.json.get('movies')
    if not movies_json or len(movies_json) < 2:
        return jsonify({"error": "Нужно добавить хотя бы два фильма"}), 400
    lottery_id = generate_unique_id()
    new_lottery = Lottery(id=lottery_id)
    db.session.add(new_lottery)
    for movie_data in movies_json:
        new_movie = Movie(name=movie_data['name'], poster=movie_data.get('poster'), year=movie_data.get('year'), lottery=new_lottery)
        db.session.add(new_movie)
    max_z_index = db.session.query(db.func.max(BackgroundPhoto.z_index)).scalar() or 0
    for movie_data in movies_json:
        poster = movie_data.get('poster')
        if poster and not BackgroundPhoto.query.filter_by(poster_url=poster).first():
            max_z_index += 1
            new_photo = BackgroundPhoto(poster_url=poster, pos_top=random.uniform(5, 65), pos_left=random.uniform(5, 75), rotation=random.randint(-30, 30), z_index=max_z_index)
            db.session.add(new_photo)
    db.session.commit()
    return jsonify({"wait_url": url_for('wait_for_result', lottery_id=lottery_id)})

@app.route('/wait/<lottery_id>')
def wait_for_result(lottery_id):
    lottery = Lottery.query.get_or_404(lottery_id)
    play_url = url_for('play_lottery', lottery_id=lottery_id, _external=True)
    background_photos = get_background_photos()
    return render_template('wait.html', lottery_id=lottery_id, play_url=play_url, background_photos=background_photos)

@app.route('/history')
def history():
    all_lotteries = Lottery.query.order_by(Lottery.created_at.desc()).all()
    background_photos = get_background_photos()
    return render_template('history.html', lotteries=all_lotteries, background_photos=background_photos)

@app.route('/l/<lottery_id>')
def play_lottery(lottery_id):
    lottery = Lottery.query.get_or_404(lottery_id)
    result_obj = {"name": lottery.result_name, "poster": lottery.result_poster, "year": lottery.result_year} if lottery.result_name else None
    background_photos = get_background_photos()
    return render_template('play.html', lottery=lottery, result=result_obj, background_photos=background_photos)

@app.route('/draw/<lottery_id>', methods=['POST'])
def draw_winner(lottery_id):
    lottery = Lottery.query.get_or_404(lottery_id)
    if lottery.result_name:
        return jsonify({"name": lottery.result_name, "poster": lottery.result_poster, "year": lottery.result_year})
    winner = random.choice(lottery.movies)
    lottery.result_name = winner.name
    lottery.result_poster = winner.poster
    lottery.result_year = winner.year
    db.session.commit()
    return jsonify({"name": winner.name, "poster": winner.poster, "year": winner.year})

@app.route('/api/result/<lottery_id>')
def get_result_data(lottery_id):
    lottery = Lottery.query.get_or_404(lottery_id)
    play_url = url_for('play_lottery', lottery_id=lottery_id, _external=True)
    result_data = {"name": lottery.result_name, "poster": lottery.result_poster, "year": lottery.result_year} if lottery.result_name else None
    return jsonify({"movies": [{"name": m.name, "poster": m.poster, "year": m.year} for m in lottery.movies], "result": result_data, "createdAt": lottery.created_at.isoformat() + "Z", "play_url": play_url})

@app.route('/delete-lottery/<lottery_id>', methods=['POST'])
def delete_lottery(lottery_id):
    lottery_to_delete = Lottery.query.get(lottery_id)
    if lottery_to_delete:
        db.session.delete(lottery_to_delete)
        db.session.commit()
        return jsonify({"success": True, "message": "Лотерея удалена."})
    return jsonify({"success": False, "message": "Лотерея не найдена."}), 404

# --- НОВЫЕ МАРШРУТЫ ДЛЯ УПРАВЛЕНИЯ ТОРРЕНТАМИ ---

@app.route('/api/start-download/<lottery_id>', methods=['POST'])
def start_download(lottery_id):
    lottery = Lottery.query.get_or_404(lottery_id)
    if not lottery.result_name:
        return jsonify({"success": False, "message": "Лотерея еще не разыграна"}), 400

    try:
        qbt_client = Client(host=QBIT_HOST, port=QBIT_PORT, username=QBIT_USERNAME, password=QBIT_PASSWORD)
        qbt_client.auth_log_in()

        search_query = f"{lottery.result_name} {lottery.result_year}"
        category = f"lottery-{lottery.id}"

        # Проверяем, не скачивается ли уже этот торрент
        existing_torrents = qbt_client.torrents_info(category=category)
        if existing_torrents:
            return jsonify({"success": True, "message": "Загрузка уже активна или завершена"})

        # Запускаем поиск
        job = qbt_client.search_start(pattern=search_query, plugins='all', category='all')
        
        # Ждем результатов поиска
        time.sleep(10) # Даем плагинам время на поиск
        results = qbt_client.search_results(jobID=job['id'])
        qbt_client.search_delete(jobID=job['id'])

        if not results['results']:
            return jsonify({"success": False, "message": "Фильм не найден на трекерах"}), 404

        # Выбираем лучший торрент (по количеству сидов)
        best_torrent = max(results['results'], key=lambda t: t['num_seeds'])
        
        # Начинаем загрузку
        qbt_client.torrents_add(
            urls=best_torrent['fileUrl'],
            category=category,
            sequential='true' # Включаем последовательную загрузку
        )
        
        return jsonify({"success": True, "message": f"Загрузка фильма '{lottery.result_name}' началась!"})

    except LoginFailed:
        return jsonify({"success": False, "message": "Неверный логин или пароль от qBittorrent"}), 500
    except Exception as e:
        print(f"Ошибка при работе с qBittorrent: {e}")
        return jsonify({"success": False, "message": f"Ошибка подключения к qBittorrent: {e}"}), 500
    finally:
        try:
            qbt_client.auth_log_out()
        except:
            pass

@app.route('/api/torrent-status/<lottery_id>')
def get_torrent_status(lottery_id):
    try:
        qbt_client = Client(host=QBIT_HOST, port=QBIT_PORT, username=QBIT_USERNAME, password=QBIT_PASSWORD, REQUESTS_TIMEOUT=10)
        qbt_client.auth_log_in()
        
        category = f"lottery-{lottery.id}"
        torrents = qbt_client.torrents_info(category=category)

        if not torrents:
            return jsonify({"status": "not_found"})

        torrent = torrents[0]
        # Форматируем данные для удобного отображения
        status_info = {
            "status": torrent.state,
            "progress": f"{torrent.progress * 100:.1f}",
            "speed": f"{torrent.dlspeed / 1024 / 1024:.2f}", # МБ/с
            "eta": f"{torrent.eta // 3600}ч {(torrent.eta % 3600) // 60}м",
            "name": torrent.name
        }
        return jsonify(status_info)

    except Exception as e:
        return jsonify({"status": "error", "message": str(e)})
    finally:
        try:
            qbt_client.auth_log_out()
        except:
            pass


@app.route('/init-db/super-secret-key-for-db-init-12345')
def init_db():
    with app.app_context():
        db.drop_all() 
        db.create_all() 
    return "База данных полностью очищена и создана заново!"

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)