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


# --- Модели Данных (ОБНОВЛЕНО) ---

# НОВАЯ ТАБЛИЦА "ВЕЧНОЙ ПАМЯТИ"
class MovieIdentifier(db.Model):
    __tablename__ = 'movie_identifier'
    kinopoisk_id = db.Column(db.Integer, primary_key=True, autoincrement=False)
    magnet_link = db.Column(db.Text, nullable=False)

class Lottery(db.Model):
    id = db.Column(db.String(6), primary_key=True)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    result_name = db.Column(db.String(200), nullable=True)
    result_poster = db.Column(db.String(500), nullable=True)
    result_year = db.Column(db.String(10), nullable=True)
    movies = db.relationship('Movie', backref='lottery', lazy=True, cascade="all, delete-orphan")

class Movie(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    # НОВОЕ ПОЛЕ для связи с "вечной памятью"
    kinopoisk_id = db.Column(db.Integer, nullable=True)
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
        if 'docs' in data and data['docs']: movie_data = data['docs'][0]
        elif 'id' in data: movie_data = data
        else: return None
        genres = [g['name'] for g in movie_data.get('genres', [])[:3]]
        countries = [c['name'] for c in movie_data.get('countries', [])[:3]]
        return {
            "kinopoisk_id": movie_data.get('id'), # <-- ВАЖНО: Возвращаем ID
            "name": movie_data.get('name', 'Название не найдено'), "poster": movie_data.get('poster', {}).get('url'),
            "year": str(movie_data.get('year', '')), "description": movie_data.get('description', 'Описание отсутствует.'),
            "rating_kp": movie_data.get('rating', {}).get('kp', 0.0), "genres": ", ".join(genres), "countries": ", ".join(countries)
        }
    except requests.exceptions.RequestException as e:
        print(f"Ошибка при запросе к API Кинопоиска: {e}")
        return None

def generate_unique_id(length=6):
    while True:
        lottery_id = ''.join(random.choices(string.ascii_lowercase + string.digits, k=length))
        if not Lottery.query.get(lottery_id): return lottery_id

def get_background_photos():
    try:
        return BackgroundPhoto.query.order_by(BackgroundPhoto.added_at.desc()).limit(20).all()
    except ProgrammingError:
        return []

# --- Маршруты ---
@app.route('/')
def index():
    return render_template('index.html', background_photos=get_background_photos())

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
    
    new_lottery = Lottery(id=generate_unique_id())
    db.session.add(new_lottery)

    for movie_data in movies_json:
        new_movie = Movie(
            kinopoisk_id=movie_data.get('kinopoisk_id'), # <-- Сохраняем ID
            name=movie_data['name'], poster=movie_data.get('poster'), year=movie_data.get('year'),
            description=movie_data.get('description'), rating_kp=movie_data.get('rating_kp'),
            genres=movie_data.get('genres'), countries=movie_data.get('countries'), lottery=new_lottery
        )
        db.session.add(new_movie)
    
    max_z_index = db.session.query(db.func.max(BackgroundPhoto.z_index)).scalar() or 0
    for movie_data in movies_json:
        if poster := movie_data.get('poster'):
            if not BackgroundPhoto.query.filter_by(poster_url=poster).first():
                max_z_index += 1
                new_photo = BackgroundPhoto(poster_url=poster, pos_top=random.uniform(5, 65), pos_left=random.uniform(5, 75), rotation=random.randint(-30, 30), z_index=max_z_index)
                db.session.add(new_photo)
    
    db.session.commit()
    return jsonify({"wait_url": url_for('wait_for_result', lottery_id=new_lottery.id)})

@app.route('/wait/<lottery_id>')
def wait_for_result(lottery_id):
    Lottery.query.get_or_404(lottery_id)
    return render_template('wait.html', lottery_id=lottery_id, play_url=url_for('play_lottery', lottery_id=lottery_id, _external=True), background_photos=get_background_photos())

@app.route('/history')
def history():
    return render_template('history.html', lotteries=Lottery.query.order_by(Lottery.created_at.desc()).all(), background_photos=get_background_photos())

@app.route('/l/<lottery_id>')
def play_lottery(lottery_id):
    lottery = Lottery.query.get_or_404(lottery_id)
    result_obj = {"name": lottery.result_name, "poster": lottery.result_poster, "year": lottery.result_year} if lottery.result_name else None
    return render_template('play.html', lottery=lottery, result=result_obj, background_photos=get_background_photos())

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
    movies_data = []
    for m in lottery.movies:
        identifier = MovieIdentifier.query.get(m.kinopoisk_id)
        movies_data.append({
            "kinopoisk_id": m.kinopoisk_id, "name": m.name, "poster": m.poster, "year": m.year, 
            "description": m.description, "rating_kp": m.rating_kp, "genres": m.genres, "countries": m.countries,
            "has_magnet": bool(identifier), "magnet_link": identifier.magnet_link if identifier else None
        })

    result_data = next((m for m in movies_data if m["name"] == lottery.result_name), None) if lottery.result_name else None
    return jsonify({"movies": movies_data, "result": result_data, "createdAt": lottery.created_at.isoformat() + "Z", "play_url": url_for('play_lottery', lottery_id=lottery.id, _external=True)})

@app.route('/delete-lottery/<lottery_id>', methods=['POST'])
def delete_lottery(lottery_id):
    if lottery := Lottery.query.get(lottery_id):
        db.session.delete(lottery)
        db.session.commit()
        return jsonify({"success": True, "message": "Лотерея удалена."})
    return jsonify({"success": False, "message": "Лотерея не найдена."}), 404

# --- НОВЫЕ И ОБНОВЛЕННЫЕ МАРШРУТЫ ---

@app.route('/api/movie-magnet', methods=['POST'])
def save_movie_magnet():
    data = request.json
    kinopoisk_id = data.get('kinopoisk_id')
    magnet_link = data.get('magnet_link')

    if not kinopoisk_id:
        return jsonify({"success": False, "message": "Отсутствует ID фильма"}), 400

    identifier = MovieIdentifier.query.get(kinopoisk_id)
    if magnet_link:
        if identifier:
            identifier.magnet_link = magnet_link
        else:
            identifier = MovieIdentifier(kinopoisk_id=kinopoisk_id, magnet_link=magnet_link)
            db.session.add(identifier)
        message = "Magnet-ссылка сохранена."
    elif identifier:
        db.session.delete(identifier)
        message = "Magnet-ссылка удалена."
    else:
        message = "Действий не требуется."
        
    db.session.commit()
    return jsonify({"success": True, "message": message})


@app.route('/api/start-download/<int:kinopoisk_id>', methods=['POST'])
def start_download(kinopoisk_id):
    identifier = MovieIdentifier.query.get_or_404(kinopoisk_id)
    movie_in_lottery = Movie.query.filter_by(kinopoisk_id=kinopoisk_id).first()
    category = f"lottery-{movie_in_lottery.lottery_id}" if movie_in_lottery else "lottery-default"

    try:
        qbt_client = Client(host=QBIT_HOST, port=QBIT_PORT, username=QBIT_USERNAME, password=QBIT_PASSWORD)
        qbt_client.auth_log_in()
        qbt_client.torrents_add(urls=identifier.magnet_link, category=category, is_sequential='true')
        qbt_client.auth_log_out()
        return jsonify({"success": True, "message": "Загрузка началась!"})
    except Exception as e:
        return jsonify({"success": False, "message": f"Ошибка qBittorrent: {e}"}), 500

@app.route('/api/torrent-status/<lottery_id>')
def get_torrent_status(lottery_id):
    qbt_client = None
    try:
        qbt_client = Client(host=QBIT_HOST, port=QBIT_PORT, username=QBIT_USERNAME, password=QBIT_PASSWORD)
        qbt_client.auth_log_in()
        torrents = qbt_client.torrents_info(category=f"lottery-{lottery_id}")
        if not torrents:
            return jsonify({"status": "not_found"})
        
        torrent = torrents[0]
        return jsonify({
            "status": torrent.state, "progress": f"{torrent.progress * 100:.1f}",
            "speed": f"{torrent.dlspeed / 1024 / 1024:.2f}", "name": torrent.name,
            "eta": f"{torrent.eta // 3600}ч {(torrent.eta % 3600) // 60}м"
        })
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