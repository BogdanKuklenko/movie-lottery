// static/js/play.js
document.addEventListener('DOMContentLoaded', () => {
    const drawButton = document.getElementById('draw-button');
    const preDrawDiv = document.getElementById('pre-draw');
    const resultDiv = document.getElementById('result-display');
    const rouletteDiv = document.querySelector('.roulette');

    // Заполняем "рулетку" постерами для анимации (тройной набор для бесконечного цикла)
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

            // --- НОВАЯ ЛОГИКА АНИМАЦИИ ---

            // 1. Запускаем бесконечное вращение
            rouletteDiv.classList.add('is-spinning');

            // 2. Через несколько секунд начинаем остановку
            setTimeout(() => {
                // Вычисляем финальную позицию для победителя
                const oneTurnDistance = rouletteDiv.scrollWidth / 3;
                const targetPosition = targetElement.offsetLeft + targetElement.offsetWidth / 2;
                const centerPosition = rouletteContainer.offsetWidth / 2;
                // Важно: мы берем остаток от деления текущей позиции на ширину блока,
                // чтобы остановка была плавной из любой точки бесконечной прокрутки.
                const currentOffset = (targetPosition - centerPosition) % oneTurnDistance;
                const finalPosition = -(currentOffset + oneTurnDistance);

                // Убираем анимацию бесконечной прокрутки
                rouletteDiv.classList.remove('is-spinning');
                
                // Моментально устанавливаем текущее положение, чтобы избежать рывка
                const currentTransform = window.getComputedStyle(rouletteDiv).transform;
                rouletteDiv.style.transform = currentTransform;

                // Включаем анимацию плавной остановки и задаем конечную точку
                setTimeout(() => {
                    rouletteDiv.classList.add('is-stopping');
                    rouletteDiv.style.transform = `translateX(${finalPosition}px)`;
                    targetElement.classList.add('winner');
                }, 10); // Микро-задержка для применения стилей

            }, 2500); // Время бесконечного вращения (в миллисекундах)


            // 3. После завершения всей анимации (вращение + остановка) показываем результат
            setTimeout(() => {
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
            }, 6500); // 2500мс (вращение) + 4000мс (остановка)

        } catch (error) {
            console.error(error);
            alert(error.message);
            drawButton.disabled = false;
            drawButton.textContent = 'Узнать свою судьбу!';
        }
    });
});