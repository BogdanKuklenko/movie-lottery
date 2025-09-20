# app.py

import os
import json
import random
import re
import string
import requests
from flask import Flask, render_template, request, jsonify, url_for
from datetime import datetime
from werkzeug.middleware.proxy_fix import ProxyFix
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy.exc import ProgrammingError
from qbittorrentapi import Client

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


# --- Модели Данных ---
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
    for movie_data in movies_json:
        new_movie = Movie(
            name=movie_data['name'], poster=movie_data.get('poster'), year=movie_data.get('year'),
            description=movie_data.get('description'), rating_kp=movie_data.get('rating_kp'),
            genres=movie_data.get('genres'), countries=movie_data.get('countries'), lottery=new_lottery
        )
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
    movies_for_js = [{"name": m.name, "poster": m.poster, "year": m.year} for m in lottery.movies]
    return render_template('play.html', lottery=lottery, result=result_obj, background_photos=background_photos, movies_for_js=json.dumps(movies_for_js))

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
    movies_data = [{
        "name": m.name, "poster": m.poster, "year": m.year, "description": m.description,
        "rating_kp": m.rating_kp, "genres": m.genres, "countries": m.countries
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


# --- НОВАЯ УПРОЩЕННАЯ ЛОГИКА СКАЧИВАНИЯ ЧЕРЕЗ ПУБЛИЧНЫЙ API ---

def _format_eta(eta_seconds):
    if eta_seconds is None or eta_seconds < 0:
        return None
    hours, remainder = divmod(int(eta_seconds), 3600)
    minutes = remainder // 60
    if hours:
        return f"{hours}ч {minutes}м"
    return f"{minutes}м"


def _search_torrenter_api(search_query):
    api_url = f"https://torrenter.org/api/search?q={requests.utils.quote(search_query)}"
    print(f"Отправляю запрос в Torrenter API: {search_query}")
    response = requests.get(api_url, timeout=15)
    response.raise_for_status()
    results = response.json()
    normalized = []
    for torrent in results or []:
        magnet_link = torrent.get('magnet') or torrent.get('magnet_link')
        if not magnet_link:
            continue
        try:
            seeders = int(torrent.get('seeders', 0))
        except (TypeError, ValueError):
            seeders = 0
        normalized.append({
            "magnet": magnet_link,
            "seeders": seeders,
            "name": torrent.get('name'),
        })
    return normalized


def _search_apibay_api(search_query):
    api_url = f"https://apibay.org/q.php?q={requests.utils.quote(search_query)}&cat=201"
    print(f"Отправляю запрос в apibay API: {search_query}")
    response = requests.get(api_url, timeout=15)
    response.raise_for_status()
    data = response.json()
    if isinstance(data, dict) and data.get('error'):
        return []
    normalized = []
    for torrent in data or []:
        info_hash = torrent.get('info_hash')
        name = torrent.get('name')
        if not info_hash or not name:
            continue
        try:
            seeders = int(torrent.get('seeders', 0))
        except (TypeError, ValueError):
            seeders = 0
        magnet_name = requests.utils.quote(name, safe='')
        magnet_link = (
            f"magnet:?xt=urn:btih:{info_hash}&dn={magnet_name}"
            "&tr=udp://tracker.openbittorrent.com:6969/announce"
            "&tr=udp://tracker.opentrackr.org:1337/announce"
        )
        normalized.append({
            "magnet": magnet_link,
            "seeders": seeders,
            "name": name,
        })
    return normalized


def _search_torrents(search_query):
    search_strategies = (
        _search_torrenter_api,
        _search_apibay_api,
    )
    for strategy in search_strategies:
        try:
            results = strategy(search_query)
            if results:
                return results
        except requests.exceptions.RequestException as exc:
            print(f"Ошибка при обращении к {strategy.__name__}: {exc}")
        except ValueError as exc:
            print(f"Ошибка при обработке ответа {strategy.__name__}: {exc}")
    return []


# --- Маршрут запуска скачивания ---
@app.route('/api/start-download/<lottery_id>', methods=['POST'])
def start_download(lottery_id):
    lottery = Lottery.query.get_or_404(lottery_id)
    if not lottery.result_name:
        return jsonify({"success": False, "message": "Лотерея еще не разыграна"}), 400

    qbt_client = None
    try:
        qbt_client = Client(host=QBIT_HOST, port=QBIT_PORT, username=QBIT_USERNAME, password=QBIT_PASSWORD)
        qbt_client.auth_log_in()
        category = f"lottery-{lottery_id}"
        if qbt_client.torrents_info(category=category):
            return jsonify({"success": True, "message": "Загрузка уже активна или завершена"})

        # 1. Формируем поисковый запрос к API
        search_query = f"{lottery.result_name} {lottery.result_year}".strip()
        results = _search_torrents(search_query)

        if not results:
            return jsonify({"success": False, "message": "Фильм не найден через доступные API."}), 404

        # 2. Ищем лучший торрент по сидам
        best_torrent = max(results, key=lambda torrent: torrent.get('seeders', 0))
        magnet_link = best_torrent.get('magnet')

        if not magnet_link:
            return jsonify({"success": False, "message": "Фильм найден, но не удалось получить magnet-ссылку."}), 404

        max_seeders = best_torrent.get('seeders', 0)

        # 3. Отправляем найденную magnet-ссылку в qBittorrent
        print(f"Найдена лучшая ссылка с {max_seeders} сидами. Отправляю в qBittorrent.")
        qbt_client.torrents_add(urls=magnet_link, category=category, is_sequential='true')
        return jsonify({"success": True, "message": f"Загрузка '{lottery.result_name}' началась!"})

    except Exception as e:
        error_message = f"Ошибка при запуске скачивания через API: {e}"
        print(error_message)
        return jsonify({"success": False, "message": error_message}), 500
    finally:
        if qbt_client:
            try:
                qbt_client.auth_log_out()
            except Exception:
                pass


# --- Маршрут для статуса торрента ---
def _format_eta(eta_seconds):
    if eta_seconds is None or eta_seconds < 0:
        return None
    hours, remainder = divmod(int(eta_seconds), 3600)
    minutes = remainder // 60
    if hours:
        return f"{hours}ч {minutes}м"
    return f"{minutes}м"

@app.route('/api/torrent-status/<lottery_id>')
def get_torrent_status(lottery_id):
    qbt_client = None
    try:
        lottery_id = str(lottery_id)
        qbt_client = Client(host=QBIT_HOST, port=QBIT_PORT, username=QBIT_USERNAME, password=QBIT_PASSWORD)
        qbt_client.auth_log_in()
        category = f"lottery-{lottery_id}"
        torrents = qbt_client.torrents_info(category=category)
        if not torrents:
            return jsonify({"status": "not_found"})

        torrent = torrents[0]
        progress_percent = round(torrent.progress * 100, 1) if torrent.progress is not None else 0.0
        download_speed_mbps = round(torrent.dlspeed / 1024 / 1024, 2) if torrent.dlspeed is not None else 0.0
        eta_display = _format_eta(torrent.eta)

        status_info = {
            "status": torrent.state,
            "progress": progress_percent,
            "speed_mbps": download_speed_mbps,
            "eta": eta_display,
            "name": torrent.name,
        }
        return jsonify(status_info)
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)})
    finally:
        if qbt_client:
            try:
                qbt_client.auth_log_out()
            except Exception:
                pass


# --- Служебные маршруты ---
@app.route('/init-db/super-secret-key-for-db-init-12345')
def init_db():
    with app.app_context():
        db.drop_all()
        db.create_all()
    return "База данных полностью очищена и создана заново!"

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
