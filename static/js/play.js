// static/js/play.js
document.addEventListener('DOMContentLoaded', () => {
    const drawButton = document.getElementById('draw-button');
    const preDrawDiv = document.getElementById('pre-draw');
    const resultDiv = document.getElementById('result-display');
    const rouletteDiv = document.querySelector('.roulette');

    // Запрещаем стандартное контекстное меню на рулетке
    rouletteDiv.addEventListener('contextmenu', e => e.preventDefault());

    // Заполняем "рулетку" постерами для анимации
    const animationMovies = [...lotteryData, ...lotteryData, ...lotteryData];
    animationMovies.forEach(movie => {
        const img = document.createElement('img');
        img.src = movie.poster || 'https://via.placeholder.com/100x150.png?text=No+Image';
        // Запрещаем перетаскивание картинок
        img.ondragstart = () => false;
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

            // --- НОВАЯ, НАДЕЖНАЯ ЛОГИКА АНИМАЦИИ НА ANIME.JS ---

            // 1. Рассчитываем финальную позицию для остановки (в центре)
            const targetPosition = targetElement.offsetLeft + targetElement.offsetWidth / 2;
            const centerPosition = rouletteContainer.offsetWidth / 2;
            const finalPosition = -(targetPosition - centerPosition);

            // 2. Добавляем несколько оборотов для эффекта "прокрутки"
            const oneTurnDistance = rouletteDiv.scrollWidth / 3;
            const randomTurns = Math.floor(Math.random() * 2) + 4; // от 4 до 5 оборотов
            const animationTargetPosition = finalPosition - (oneTurnDistance * randomTurns);
            
            // 3. Запускаем анимацию, которая стартует из текущей позиции
            anime({
                targets: rouletteDiv,
                translateX: animationTargetPosition, // Анимируем до конечной точки
                duration: 7000, // Немного увеличим время для плавности
                easing: 'cubicBezier(0.2, .8, .2, 1)', // Кривая для плавного старта и замедления

                complete: function() {
                    // Плавно скрываем рулетку и показываем финальный результат
                    preDrawDiv.style.transition = 'opacity 0.5s ease-out';
                    preDrawDiv.style.opacity = '0';

                    document.body.classList.add('no-scroll');

                    setTimeout(() => {
                        preDrawDiv.style.display = 'none';
                        document.getElementById('result-poster').src = winner.poster || 'https://via.placeholder.com/200x300.png?text=No+Image';
                        document.getElementById('result-name').textContent = winner.name;
                        document.getElementById('result-year').textContent = winner.year;
                        resultDiv.style.display = 'flex';
                    }, 500);
                }
            });

            // Выделяем победителя ближе к концу анимации
            setTimeout(() => {
                targetElement.classList.add('winner');
            }, 6000); // за 1 секунду до конца

        } catch (error) {
            console.error(error);
            alert(error.message);
            drawButton.disabled = false;
            drawButton.textContent = 'Узнать свою судьбу!';
        }
    });
});