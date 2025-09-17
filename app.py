# app.py

import json
import random
import re
import string
import requests
from flask import Flask, render_template, request, jsonify, redirect, url_for
from datetime import datetime

# --- Конфигурация ---
app = Flask(__name__)
# ВАЖНО: Убедись, что здесь твой актуальный токен
KINOPOISK_API_TOKEN = "H12KBWS-T9TMXZD-HS93HRE-16W1W18"
KINOPOISK_API_URL = "https://api.kinopoisk.dev/v1.4/movie"

# Наша "база данных" в памяти.
lotteries = {}

# --- Вспомогательные функции (без изменений) ---

def generate_unique_id(length=6):
    while True:
        lottery_id = ''.join(random.choices(string.ascii_lowercase + string.digits, k=length))
        if lottery_id not in lotteries:
            return lottery_id

def get_movie_data_from_kinopoisk(query):
    headers = {"X-API-KEY": KINOPOISK_API_TOKEN}
    params = {}
    kinopoisk_id_match = re.search(r'kinopoisk\.ru/(?:film|series)/(\d+)/', query)
    if kinopoisk_id_match:
        movie_id = kinopoisk_id_match.group(1)
        search_url = f"{KINOPOISK_API_URL}/{movie_id}"
    else:
        search_url = f"{KINOPOISK_API_URL}/search"
        params['query'] = query
        params['limit'] = 1
    try:
        response = requests.get(search_url, headers=headers, params=params)
        response.raise_for_status()
        data = response.json()
        if 'docs' in data and data['docs']:
            movie = data['docs'][0]
        elif 'id' in data:
            movie = data
        else:
            return None
        return {
            "name": movie.get('name', 'Название не найдено'),
            "poster": movie.get('poster', {}).get('url') if movie.get('poster') else None,
            "year": movie.get('year', '')
        }
    except requests.exceptions.RequestException as e:
        print(f"Ошибка при запросе к API Кинопоиска: {e}")
        return None

# --- Маршруты (URL) нашего сайта ---

@app.route('/')
def index():
    """Главная страница для создания лотереи."""
    return render_template('index.html')

@app.route('/fetch-movie', methods=['POST'])
def get_movie_info():
    """API для получения данных о фильме."""
    query = request.json.get('query')
    if not query: return jsonify({"error": "Пустой запрос"}), 400
    movie_data = get_movie_data_from_kinopoisk(query)
    if movie_data: return jsonify(movie_data)
    else: return jsonify({"error": "Фильм не найден"}), 404

@app.route('/create', methods=['POST'])
def create_lottery():
    """Создает лотерею и возвращает ссылку на страницу ожидания."""
    movies = request.json.get('movies')
    if not movies or len(movies) < 2:
        return jsonify({"error": "Нужно добавить хотя бы два фильма"}), 400

    lottery_id = generate_unique_id()
    lotteries[lottery_id] = {
        "movies": movies,
        "result": None,
        "createdAt": datetime.utcnow().isoformat() + "Z" # Добавляем дату создания
    }
    wait_url = url_for('wait_for_result', lottery_id=lottery_id)
    return jsonify({"wait_url": wait_url})

@app.route('/wait/<lottery_id>')
def wait_for_result(lottery_id):
    """Новая страница ожидания для создателя лотереи."""
    lottery = lotteries.get(lottery_id)
    if not lottery:
        return "Лотерея не найдена!", 404
    play_url = url_for('play_lottery', lottery_id=lottery_id, _external=True)
    return render_template('wait.html', lottery_id=lottery_id, play_url=play_url)

@app.route('/history')
def history():
    """Новая страница-галерея с историей всех розыгрышей."""
    # --- ИЗМЕНЕНИЕ ЗДЕСЬ ---
    # Теперь передаем ВСЕ лотереи, а не только завершенные.
    # Шаблон сам решит, как их отображать.
    return render_template('history.html', lotteries=lotteries)

@app.route('/l/<lottery_id>')
def play_lottery(lottery_id):
    """Страница для розыгрыша."""
    lottery = lotteries.get(lottery_id)
    if not lottery:
        return "Лотерея не найдена!", 404
    return render_template('play.html', lottery=lottery, result=lottery.get("result"))

@app.route('/draw/<lottery_id>', methods=['POST'])
def draw_winner(lottery_id):
    """Выбирает победителя."""
    lottery = lotteries.get(lottery_id)
    if not lottery or lottery.get("result"):
        return jsonify(lottery.get("result") if lottery else {"error": "Лотерея не найдена"}), 404
    winner = random.choice(lottery["movies"])
    lotteries[lottery_id]["result"] = winner
    return jsonify(winner)

@app.route('/api/result/<lottery_id>')
def get_result_data(lottery_id):
    """API для получения данных о лотерее."""
    lottery = lotteries.get(lottery_id)
    if not lottery:
        return jsonify({"error": "Лотерея не найдена"}), 404
    
    # Добавляем в ответ ссылку для друга, она понадобится во всплывающем окне
    play_url = url_for('play_lottery', lottery_id=lottery_id, _external=True)
    
    return jsonify({
        "movies": lottery.get("movies"),
        "result": lottery.get("result"),
        "createdAt": lottery.get("createdAt"),
        "play_url": play_url
    })

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)