// static/js/play.js
document.addEventListener('DOMContentLoaded', () => {
    const drawButton = document.getElementById('draw-button');
    const preDrawDiv = document.getElementById('pre-draw');
    const resultDiv = document.getElementById('result-display');
    const rouletteDiv = document.querySelector('.roulette');

    // Заполняем "рулетку" постерами для анимации
    const animationMovies = [...lotteryData, ...lotteryData, ...lotteryData]; 
    animationMovies.forEach(movie => {
        const img = document.createElement('img');
        img.src = movie.poster || 'https://via.placeholder.com/100x150.png?text=No+Image';
        rouletteDiv.appendChild(img);
    });

    drawButton.addEventListener('click', async () => {
        drawButton.disabled = true;
        drawButton.textContent = 'Крутим барабан...';

        try {
            const response = await fetch(drawUrl, { method: 'POST' });
            if (!response.ok) throw new Error('Не удалось провести розыгрыш');
            
            const winner = await response.json();
            const rouletteContainer = document.querySelector('.roulette-container');
            const winnerIndex = lotteryData.findIndex(m => m.name === winner.name);
            const targetElementIndex = lotteryData.length + winnerIndex; 
            const targetElement = rouletteDiv.children[targetElementIndex];
            
            // --- ЛОГИКА АНИМАЦИИ С ПОМОЩЬЮ ANIME.JS ---

            // 1. Рассчитываем базовую позицию для остановки (в центре)
            const targetPosition = targetElement.offsetLeft + targetElement.offsetWidth / 2;
            const centerPosition = rouletteContainer.offsetWidth / 2;
            let finalPosition = -(targetPosition - centerPosition);

            // 2. Искусственно добавляем несколько оборотов для эффекта
            const oneTurnDistance = rouletteDiv.scrollWidth / 3;
            const randomTurns = Math.floor(Math.random() * 2) + 3; // от 3 до 4 оборотов
            const startPosition = finalPosition - (oneTurnDistance * randomTurns);

            // 3. Запускаем анимацию с помощью Anime.js
            anime({
                targets: rouletteDiv,
                translateX: [startPosition, finalPosition], // Анимируем от дальней точки к финальной
                duration: 6000, // Общая длительность 6 секунд
                easing: 'cubicBezier(0.2, 1, 0.2, 1)', // Кривая с резким стартом и плавным торможением

                // Функция, которая вызывается на каждом кадре анимации
                update: function(anim) {
                    // Когда анимация почти завершена (прошла 85% пути), проявляем победителя
                    if (anim.progress > 85) {
                        if (!targetElement.classList.contains('winner')) {
                             targetElement.classList.add('winner');
                        }
                    }
                },

                // Функция, которая вызывается после завершения анимации
                complete: function(anim) {
                    // Плавно скрываем рулетку и показываем финальный результат
                    preDrawDiv.style.transition = 'opacity 0.5s ease-out';
                    preDrawDiv.style.opacity = '0';

                    setTimeout(() => {
                        preDrawDiv.style.display = 'none';
                        document.getElementById('result-poster').src = winner.poster || 'https://via.placeholder.com/200x300.png?text=No+Image';
                        document.getElementById('result-name').textContent = winner.name;
                        document.getElementById('result-year').textContent = winner.year;
                        resultDiv.style.display = 'flex';
                    }, 500);
                }
            });

        } catch (error) {
            console.error(error);
            alert(error.message);
            drawButton.disabled = false;
            drawButton.textContent = 'Узнать свою судьбу!';
        }
    });
});