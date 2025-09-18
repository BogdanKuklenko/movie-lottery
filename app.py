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

# --- Конфигурация ---
app = Flask(__name__)
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1, x_prefix=1)

db_uri = os.environ.get('DATABASE_URL')
if db_uri and db_uri.startswith("postgres://"):
    db_uri = db_uri.replace("postgres://", "postgresql://", 1)
app.config['SQLALCHEMY_DATABASE_URI'] = db_uri
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db = SQLAlchemy(app)

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

# --- НОВАЯ МОДЕЛЬ ДЛЯ ФОНА ---
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
    # ... (код без изменений)
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

# --- НОВАЯ ФУНКЦИЯ для получения фото для фона ---
def get_background_photos():
    # Получаем 20 последних добавленных фото для оптимизации
    return BackgroundPhoto.query.order_by(BackgroundPhoto.added_at.desc()).limit(20).all()

# --- Маршруты ---

@app.route('/')
def index():
    background_photos = get_background_photos()
    return render_template('index.html', background_photos=background_photos)

@app.route('/fetch-movie', methods=['POST'])
def get_movie_info():
    # ... (код без изменений)
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
    
    # Создаем лотерею и фильмы (как и раньше)
    lottery_id = generate_unique_id()
    new_lottery = Lottery(id=lottery_id)
    db.session.add(new_lottery)
    for movie_data in movies_json:
        new_movie = Movie(name=movie_data['name'], poster=movie_data.get('poster'), year=movie_data.get('year'), lottery=new_lottery)
        db.session.add(new_movie)
    
    # --- НОВЫЙ БЛОК: Добавляем постеры на "холст" ---
    # Получаем текущий максимальный z-index, чтобы новые фото были поверх
    max_z_index = db.session.query(db.func.max(BackgroundPhoto.z_index)).scalar() or 0
    
    for movie_data in movies_json:
        poster = movie_data.get('poster')
        if poster:
            # Проверяем, нет ли уже такого постера на холсте
            exists = BackgroundPhoto.query.filter_by(poster_url=poster).first()
            if not exists:
                max_z_index += 1
                new_photo = BackgroundPhoto(
                    poster_url=poster,
                    pos_top=random.uniform(5, 65),
                    pos_left=random.uniform(5, 75),
                    rotation=random.randint(-30, 30),
                    z_index=max_z_index
                )
                db.session.add(new_photo)

    db.session.commit()
    wait_url = url_for('wait_for_result', lottery_id=lottery_id)
    return jsonify({"wait_url": wait_url})

@app.route('/wait/<lottery_id>')
def wait_for_result(lottery_id):
    lottery = Lottery.query.get_or_404(lottery_id)
    play_url = url_for('play_lottery', lottery_id=lottery_id, _external=True)
    background_photos = get_background_photos()
    return render_template('wait.html', lottery_id=lottery_id, play_url=play_url, lottery=lottery, background_photos=background_photos)

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
    # ... (код без изменений)
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
    # ... (код без изменений)
    lottery = Lottery.query.get_or_404(lottery_id)
    play_url = url_for('play_lottery', lottery_id=lottery_id, _external=True)
    result_data = {"name": lottery.result_name, "poster": lottery.result_poster, "year": lottery.result_year} if lottery.result_name else None
    return jsonify({"movies": [{"name": m.name, "poster": m.poster, "year": m.year} for m in lottery.movies], "result": result_data, "createdAt": lottery.created_at.isoformat() + "Z", "play_url": play_url})

# --- НОВЫЙ МАРШРУТ ДЛЯ УДАЛЕНИЯ ---
@app.route('/delete-lottery/<lottery_id>', methods=['POST'])
def delete_lottery(lottery_id):
    lottery_to_delete = Lottery.query.get(lottery_id)
    if lottery_to_delete:
        db.session.delete(lottery_to_delete)
        db.session.commit()
        return jsonify({"success": True, "message": "Лотерея удалена."})
    return jsonify({"success": False, "message": "Лотерея не найдена."}), 404

# --- МАРШРУТ ДЛЯ ПЕРЕСОЗДАНИЯ БАЗЫ ДАННЫХ ---
@app.route('/init-db/super-secret-key-for-db-init-12345')
def init_db():
    with app.app_context():
        db.drop_all() # Сначала удаляем все старые таблицы
        db.create_all() # Затем создаем новые по нашим моделям
    return "База данных полностью очищена и создана заново!"

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)