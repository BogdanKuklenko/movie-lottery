// static/js/main.js

// Глобальный массив с фильмами, чтобы background.js мог его использовать
var movies = [];

document.addEventListener('DOMContentLoaded', () => {
    // Получаем все нужные элементы со страницы
    const movieInput = document.getElementById('movie-input');
    const addMovieBtn = document.getElementById('add-movie-btn');
    const createLotteryBtn = document.getElementById('create-lottery-btn');
    const movieListDiv = document.getElementById('movie-list');
    const loader = document.getElementById('loader');
    const errorMessage = document.getElementById('error-message');

    const updateCreateButtonState = () => {
        createLotteryBtn.disabled = movies.length < 2;
    };

    const renderMovieList = () => {
        movieListDiv.innerHTML = '';
        movies.forEach((movie, index) => {
            const movieCard = document.createElement('div');
            movieCard.className = 'movie-card';
            movieCard.innerHTML = `
                <img src="${movie.poster || 'https://via.placeholder.com/100x150.png?text=No+Image'}" alt="Постер">
                <div class="movie-info">
                    <h4>${movie.name}</h4>
                    <p>${movie.year}</p>
                </div>
                <button class="remove-btn" data-index="${index}">&times;</button>
            `;
            movieListDiv.appendChild(movieCard);
        });
        
        // Добавляем обработчики для кнопок удаления
        document.querySelectorAll('.remove-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                const indexToRemove = parseInt(e.target.dataset.index, 10);
                movies.splice(indexToRemove, 1);
                renderMovieList(); // Перерисовываем список
                updateCreateButtonState(); // Обновляем состояние кнопки
            });
        });
    };

    const addMovie = async () => {
        const query = movieInput.value.trim();
        if (!query) return;

        loader.style.display = 'block';
        errorMessage.textContent = '';
        addMovieBtn.disabled = true;

        try {
            const response = await fetch('/fetch-movie', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: query })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Не удалось найти фильм');
            }

            const movieData = await response.json();
            movies.push(movieData);
            renderMovieList();
            updateCreateButtonState();
            movieInput.value = '';

        } catch (error) {
            errorMessage.textContent = error.message;
        } finally {
            loader.style.display = 'none';
            addMovieBtn.disabled = false;
        }
    };
    
    addMovieBtn.addEventListener('click', addMovie);
    movieInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            addMovie();
        }
    });

    // --- ОБНОВЛЕННАЯ ЛОГИКА СОЗДАНИЯ ЛОТЕРЕИ ---
    createLotteryBtn.addEventListener('click', async () => {
        createLotteryBtn.disabled = true;
        createLotteryBtn.textContent = 'Перенаправление...';
        try {
            const response = await fetch('/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ movies: movies })
            });
            if (!response.ok) throw new Error('Не удалось создать лотерею на сервере');
            
            const data = await response.json();

            // Если сервер вернул ссылку для перенаправления - переходим по ней
            if (data.wait_url) {
                window.location.href = data.wait_url;
            }

        } catch (error) {
            errorMessage.textContent = error.message;
            createLotteryBtn.disabled = false;
            createLotteryBtn.textContent = 'Создать лотерею и перейти к ожиданию';
        }
    });
});