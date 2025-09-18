// static/js/background.js

// Переменная для хранения таймера, чтобы мы могли его останавливать и запускать заново
let backgroundInterval = null;

// Создаем глобальную функцию, к которой сможет обратиться main.js
window.updateDynamicBackground = (movieList) => {
    const rotator = document.querySelector('.background-rotator');
    if (!rotator) return;

    // Останавливаем предыдущую анимацию, если она была
    if (backgroundInterval) {
        clearInterval(backgroundInterval);
    }
    // Очищаем фон от старых фото
    rotator.innerHTML = '';

    const posters = movieList.map(m => m.poster).filter(Boolean);

    if (posters.length === 0) {
        return; // Если постеров нет, просто выходим
    }

    // Перемешиваем массив постеров для разнообразия
    posters.sort(() => Math.random() - 0.5);

    let posterIndex = 0;
    let zIndexCounter = 1;
    const MAX_PHOTOS = 15;

    const addPhotoToBackground = () => {
        if (rotator.children.length >= MAX_PHOTOS) {
            rotator.removeChild(rotator.children[0]);
        }

        const imageUrl = posters[posterIndex];
        const div = document.createElement('div');
        div.className = 'bg-image';
        div.style.backgroundImage = `url(${imageUrl})`;

        const randomTop = Math.random() * 60 + 10;
        const randomLeft = Math.random() * 70 + 5;
        const randomRotate = Math.random() * 40 - 20;
        
        div.style.top = `${randomTop}%`;
        div.style.left = `${randomLeft}%`;
        div.style.zIndex = zIndexCounter++;
        div.style.setProperty('--final-transform', `rotate(${randomRotate}deg) scale(1)`);
        
        rotator.appendChild(div);

        setTimeout(() => {
            div.classList.add('falling');
        }, 10);

        posterIndex = (posterIndex + 1) % posters.length;
    };

    addPhotoToBackground(); // Добавляем первое фото сразу
    backgroundInterval = setInterval(addPhotoToBackground, 4000); // Запускаем карусель
};


// Этот код, как и раньше, пытается запустить фон при первоначальной загрузке страницы
// (для страниц истории и ожидания)
document.addEventListener('DOMContentLoaded', () => {
    let initialMovies = [];
    if (typeof movies !== 'undefined' && Array.isArray(movies)) {
        initialMovies = movies;
    } else if (typeof lotteryData !== 'undefined' && Array.isArray(lotteryData)) {
        initialMovies = lotteryData;
    } else if (typeof lottery !== 'undefined' && lottery.movies) {
        initialMovies = lottery.movies;
    }

    if (initialMovies.length > 0) {
        window.updateDynamicBackground(initialMovies);
    }
});