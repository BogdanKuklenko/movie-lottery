# app.py

import os
import json
import random
import re
import string
import requests
import threading
from flask import Flask, render_template, request, jsonify, url_for
from datetime import datetime, timedelta
from werkzeug.middleware.proxy_fix import ProxyFix
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy.exc import ProgrammingError
from qbittorrentapi import Client
from torrentp import TorrentDownloader

# --- Конфигурация ---
app = Flask(__name__)
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1, x_prefix=1)

db_uri = os.environ.get('DATABASE_URL')
if db_uri and db_uri.startswith("postgres://"):
    db_uri = db_uri.replace("postgres://", "postgresql://", 1)
app.config['SQLALCHEMY_DATABASE_URI'] = db_uri
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db = SQLAlchemy(app)

# --- Конфигурация qBittorrent ---
QBIT_HOST = os.environ.get('QBIT_HOST')
QBIT_PORT = os.environ.get('QBIT_PORT')
QBIT_USERNAME = os.environ.get('QBIT_USERNAME')
QBIT_PASSWORD = os.environ.get('QBIT_PASSWORD')


# --- Модели Данных (ОБНОВЛЕНО) ---
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
    description = db.Column(db.Text, nullable=True)
    rating_kp = db.Column(db.Float, nullable=True)
    genres = db.Column(db.String(200), nullable=True)
    countries = db.Column(db.String(200), nullable=True)
    # --- НОВЫЕ ПОЛЯ ДЛЯ КЭШИРОВАНИЯ ТОРРЕНТОВ ---
    magnet_link = db.Column(db.Text, nullable=True)
    torrent_quality = db.Column(db.String(50), nullable=True)
    torrent_seeds = db.Column(db.Integer, nullable=True)
    torrent_info_updated_at = db.Column(db.DateTime, nullable=True)

class BackgroundPhoto(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    poster_url = db.Column(db.String(500), unique=True, nullable=False)
    pos_top = db.Column(db.Float, nullable=False)
    pos_left = db.Column(db.Float, nullable=False)
    rotation = db.Column(db.Integer, nullable=False)
    z_index = db.Column(db.Integer, nullable=False)
    added_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

# --- Вспомогательные функции ---
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
        genres = [genre['name'] for genre in movie.get('genres', [])[:3]]
        countries = [country['name'] for country in movie.get('countries', [])[:3]]
        return {
            "name": movie.get('name', 'Название не найдено'), "poster": movie.get('poster', {}).get('url'),
            "year": str(movie.get('year', '')), "description": movie.get('description', 'Описание отсутствует.'),
            "rating_kp": movie.get('rating', {}).get('kp', 0.0), "genres": ", ".join(genres), "countries": ", ".join(countries)
        }
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

# --- НОВАЯ ЛОГИКА ПОИСКА И КЭШИРОВАНИЯ ТОРРЕНТОВ ---

def find_and_cache_torrent_info_task(app_context, movie_id):
    """
    Ищет лучший торрент для ОДНОГО фильма и сохраняет информацию в БД.
    """
    with app_context:
        movie = Movie.query.get(movie_id)
        if not movie:
            print(f"[Кэширование] Фильм с ID {movie_id} не найден.")
            return

        search_query = f"{movie.name} {movie.year}"
        print(f"[Кэширование] Начал поиск для: {search_query}")
        
        try:
            # Используем временную папку, как того требует библиотека
            downloader = TorrentDownloader(search_query, './temp_torrents')
            downloader.start_search()
            
            magnet = downloader.get_magnet()
            
            if magnet:
                movie.magnet_link = magnet
                movie.torrent_quality = downloader.get_quality()
                movie.torrent_seeds = downloader.get_seeds()
                movie.torrent_info_updated_at = datetime.utcnow()
                db.session.commit()
                print(f"[Кэширование] Успех! Информация для '{movie.name}' сохранена.")
            else:
                print(f"[Кэширование] Торрент для '{movie.name}' не найден.")

        except Exception as e:
            print(f"[Кэширование] Ошибка при поиске для '{movie.name}': {e}")


# --- Маршруты ---
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
    db.session.flush() # Получаем ID лотереи до коммита

    movies_to_process = []
    for movie_data in movies_json:
        new_movie = Movie(
            name=movie_data['name'], poster=movie_data.get('poster'), year=movie_data.get('year'),
            description=movie_data.get('description'), rating_kp=movie_data.get('rating_kp'),
            genres=movie_data.get('genres'), countries=movie_data.get('countries'), lottery_id=new_lottery.id
        )
        db.session.add(new_movie)
        db.session.flush() # Получаем ID фильма до коммита
        movies_to_process.append(new_movie.id)

    max_z_index = db.session.query(db.func.max(BackgroundPhoto.z_index)).scalar() or 0
    for movie_data in movies_json:
        poster = movie_data.get('poster')
        if poster and not BackgroundPhoto.query.filter_by(poster_url=poster).first():
            max_z_index += 1
            new_photo = BackgroundPhoto(poster_url=poster, pos_top=random.uniform(5, 65), pos_left=random.uniform(5, 75), rotation=random.randint(-30, 30), z_index=max_z_index)
            db.session.add(new_photo)
    
    db.session.commit()

    # Запускаем фоновый поиск для КАЖДОГО нового фильма
    for movie_id in movies_to_process:
        thread = threading.Thread(target=find_and_cache_torrent_info_task, args=(app.app_context(), movie_id))
        thread.daemon = True
        thread.start()

    return jsonify({"wait_url": url_for('wait_for_result', lottery_id=lottery_id)})

@app.route('/wait/<lottery_id>')
def wait_for_result(lottery_id):
    Lottery.query.get_or_404(lottery_id)
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
    # ОБНОВЛЕНО: передаем больше данных о торрентах
    movies_data = [{
        "id": m.id, "name": m.name, "poster": m.poster, "year": m.year, "description": m.description,
        "rating_kp": m.rating_kp, "genres": m.genres, "countries": m.countries,
        "has_magnet": bool(m.magnet_link), "quality": m.torrent_quality, "seeds": m.torrent_seeds
    } for m in lottery.movies]
    result_data = next((m for m in movies_data if m["name"] == lottery.result_name), None) if lottery.result_name else None
    return jsonify({"movies": movies_data, "result": result_data, "createdAt": lottery.created_at.isoformat() + "Z", "play_url": play_url})

@app.route('/delete-lottery/<lottery_id>', methods=['POST'])
def delete_lottery(lottery_id):
    lottery_to_delete = Lottery.query.get(lottery_id)
    if lottery_to_delete:
        db.session.delete(lottery_to_delete)
        db.session.commit()
        return jsonify({"success": True, "message": "Лотерея удалена."})
    return jsonify({"success": False, "message": "Лотерея не найдена."}), 404

# --- ОБНОВЛЕННАЯ ЛОГИКА СКАЧИВАНИЯ ---
@app.route('/api/start-download/<movie_id>', methods=['POST'])
def start_download(movie_id):
    movie = Movie.query.get_or_404(movie_id)

    if not movie.magnet_link:
        return jsonify({"success": False, "message": "Торрент для этого фильма еще не найден. Попробуйте позже."}), 404

    try:
        qbt_client = Client(host=QBIT_HOST, port=QBIT_PORT, username=QBIT_USERNAME, password=QBIT_PASSWORD)
        qbt_client.auth_log_in()
        
        # Просто добавляем готовый magnet
        qbt_client.torrents_add(urls=movie.magnet_link, category=f"lottery-{movie.lottery_id}", is_sequential='true')
        
        qbt_client.auth_log_out()
        return jsonify({"success": True, "message": f"Загрузка '{movie.name}' началась!"})
    except Exception as e:
        error_message = f"Не удалось подключиться к qBittorrent: {e}"
        print(error_message)
        return jsonify({"success": False, "message": error_message}), 500


# --- ЛОГИКА ОБНОВЛЕНИЯ СИДОВ ---
def update_all_seeders_task(app_context):
    """
    Проходит по всем фильмам в БД, которым больше суток, и обновляет инфо о сидах.
    Эту функцию нужно вызывать по расписанию (например, раз в день).
    """
    with app_context:
        print("[Обновление] Запущена задача обновления сидов.")
        movies_to_update = Movie.query.filter(
            Movie.magnet_link.isnot(None),
            Movie.torrent_info_updated_at < (datetime.utcnow() - timedelta(hours=24))
        ).all()

        if not movies_to_update:
            print("[Обновление] Нет фильмов для обновления.")
            return

        print(f"[Обновление] Найдено {len(movies_to_update)} фильмов для обновления.")
        for movie in movies_to_update:
            find_and_cache_torrent_info_task(app.app_context(), movie.id)
        
        print("[Обновление] Задача обновления сидов завершена.")

@app.route('/api/trigger-seed-update/<secret_key>')
def trigger_seed_update(secret_key):
    # Этот маршрут можно вызывать через cron для автоматического обновления
    # Для безопасности используется простой секретный ключ
    if secret_key != "YOUR_SUPER_SECRET_KEY": # Замените на свой ключ
        return "Unauthorized", 401
    
    thread = threading.Thread(target=update_all_seeders_task, args=(app.app_context(),))
    thread.daemon = True
    thread.start()
    return "Задача обновления сидов запущена в фоновом режиме.", 200


# --- Маршрут для статуса торрента (без изменений) ---
@app.route('/api/torrent-status/<lottery_id>')
def get_torrent_status(lottery_id):
    qbt_client = None
    try:
        qbt_client = Client(host=QBIT_HOST, port=QBIT_PORT, username=QBIT_USERNAME, password=QBIT_PASSWORD)
        qbt_client.auth_log_in()
        category = f"lottery-{lottery_id}"
        torrents = qbt_client.torrents_info(category=category)
        if not torrents:
            return jsonify({"status": "not_found"})
        torrent = torrents[0]
        status_info = {
            "status": torrent.state, "progress": f"{torrent.progress * 100:.1f}",
            "speed": f"{torrent.dlspeed / 1024 / 1024:.2f}",
            "eta": f"{torrent.eta // 3600}ч {(torrent.eta % 3600) // 60}м", "name": torrent.name
        }
        return jsonify(status_info)
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)})
    finally:
        if qbt_client:
            try: qbt_client.auth_log_out()
            except: pass

# --- Служебные маршруты ---
@app.route('/init-db/super-secret-key-for-db-init-12345')
def init_db():
    with app.app_context():
        db.drop_all()
        db.create_all()
    return "База данных полностью очищена и создана заново!"

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)