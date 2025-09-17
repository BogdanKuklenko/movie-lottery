// static/js/play.js
document.addEventListener('DOMContentLoaded', () => {
    const drawButton = document.getElementById('draw-button');
    const preDrawDiv = document.getElementById('pre-draw');
    const resultDiv = document.getElementById('result-display');
    const rouletteDiv = document.querySelector('.roulette');

    // Заполняем "рулетку" постерами для анимации
    // Дублируем фильмы 3 раза, чтобы анимация выглядела длиннее и плавнее
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
            if (!response.ok) {
                throw new Error('Не удалось провести розыгрыш');
            }
            const winner = await response.json();
            
            const rouletteContainer = document.querySelector('.roulette-container');
            // Находим индекс победителя в оригинальном (не тройном) списке
            const winnerIndex = lotteryData.findIndex(m => m.name === winner.name);
            // Находим целевой элемент во второй копии списка, чтобы было пространство для разгона и торможения
            const targetElementIndex = lotteryData.length + winnerIndex; 
            const targetElement = rouletteDiv.children[targetElementIndex];
            
            // --- НОВАЯ ЛОГИКА АНИМАЦИИ ---

            // 1. Рассчитываем позицию, на которой нужно остановиться (точно в центре контейнера)
            const targetPosition = targetElement.offsetLeft + targetElement.offsetWidth / 2;
            const centerPosition = rouletteContainer.offsetWidth / 2;
            const finalPosition = -(targetPosition - centerPosition);
            
            // 2. Устанавливаем CSS-переменную с конечной позицией и запускаем анимацию, добавляя класс
            rouletteDiv.style.setProperty('--winner-position', `${finalPosition}px`);
            rouletteDiv.classList.add('spinning');
            
            // 3. Добавляем класс победителю, чтобы он стал четким
            targetElement.classList.add('winner');

            // 4. Ждем завершения CSS-анимации (5 секунд), чтобы показать финальное окно
            setTimeout(() => {
                // Плавно скрываем всю секцию с рулеткой
                preDrawDiv.style.transition = 'opacity 0.5s ease-out';
                preDrawDiv.style.opacity = '0';

                // Ждем, пока секция скроется (0.5 секунды)
                setTimeout(() => {
                    preDrawDiv.style.display = 'none'; // Теперь убираем ее совсем
                    
                    // Заполняем и показываем карточку с результатом
                    document.getElementById('result-poster').src = winner.poster || 'https://via.placeholder.com/200x300.png?text=No+Image';
                    document.getElementById('result-name').textContent = winner.name;
                    document.getElementById('result-year').textContent = winner.year;
                    resultDiv.style.display = 'flex';
                }, 500);

            }, 5000); // 5 секунд, как в нашей CSS-анимации

        } catch (error) {
            console.error(error);
            alert(error.message);
            drawButton.disabled = false;
            drawButton.textContent = 'Узнать свою судьбу!';
        }
    });
});