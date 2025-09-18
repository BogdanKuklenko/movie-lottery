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
            if (!response.ok) {
                throw new Error('Не удалось провести розыгрыш');
            }
            const winner = await response.json();
            
            const rouletteContainer = document.querySelector('.roulette-container');
            const winnerIndex = lotteryData.findIndex(m => m.name === winner.name);
            const targetElementIndex = lotteryData.length + winnerIndex; 
            const targetElement = rouletteDiv.children[targetElementIndex];
            
            const targetPosition = targetElement.offsetLeft + targetElement.offsetWidth / 2;
            const centerPosition = rouletteContainer.offsetWidth / 2;
            const finalPosition = -(targetPosition - centerPosition);
            
            // Запускаем анимацию
            rouletteDiv.style.transform = `translateX(${finalPosition}px)`;
            
            // Ждем, пока барабан почти остановится, и только потом проявляем картинку
            setTimeout(() => {
                targetElement.classList.add('winner');
            }, 4000); // Анимация в CSS длится 5с, проявляем за 1с до конца

            // Ждем завершения всей CSS-анимации, чтобы показать финальное окно
            setTimeout(() => {
                preDrawDiv.style.transition = 'opacity 0.5s ease-out';
                preDrawDiv.style.opacity = '0';

                setTimeout(() => {
                    preDrawDiv.style.display = 'none';
                    
                    document.getElementById('result-poster').src = winner.poster || 'https://via.placeholder.com/200x300.png?text=No+Image';
                    document.getElementById('result-name').textContent = winner.name;
                    document.getElementById('result-year').textContent = winner.year;
                    resultDiv.style.display = 'flex';
                }, 500);

            }, 5000); // 5 секунд, как в нашей CSS-анимации transition

        } catch (error) {
            console.error(error);
            alert(error.message);
            drawButton.disabled = false;
            drawButton.textContent = 'Узнать свою судьбу!';
        }
    });
});