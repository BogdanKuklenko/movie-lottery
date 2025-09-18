// static/js/background.js

document.addEventListener('DOMContentLoaded', () => {
    // --- ОТЛАДОЧНОЕ СООБЩЕНИЕ 1 ---
    console.log("background.js: Скрипт запущен.");

    const rotator = document.querySelector('.background-rotator');
    if (!rotator) {
        console.error("background.js: ОШИБКА - не найден контейнер .background-rotator!");
        return;
    }

    let posters = [];
    
    // Универсальный сбор постеров
    if (typeof movies !== 'undefined' && Array.isArray(movies)) {
        console.log("background.js: Найден массив 'movies'.");
        posters = movies.map(m => m.poster).filter(Boolean);
    } else if (typeof lotteryData !== 'undefined' && Array.isArray(lotteryData)) {
        console.log("background.js: Найден массив 'lotteryData'.");
        posters = lotteryData.map(m => m.poster).filter(Boolean);
    } else if (typeof lottery !== 'undefined' && lottery.movies) {
        console.log("background.js: Найден объект 'lottery' с фильмами.");
        posters = lottery.movies.map(m => m.poster).filter(Boolean);
    }
    
    // --- ОТЛАДОЧНОЕ СООБЩЕНИЕ 2 ---
    console.log(`background.js: Найдено ${posters.length} постеров для фона.`);
    // Если массив не пустой, выводим его содержимое для проверки
    if (posters.length > 0) {
        console.log(posters);
    }
    
    if (posters.length === 0) {
        console.warn("background.js: Постеры не найдены, работа скрипта завершена.");
        return;
    }

    // Перемешиваем массив постеров для большего разнообразия
    posters.sort(() => Math.random() - 0.5);

    let posterIndex = 0;
    let zIndexCounter = 1;
    const MAX_PHOTOS = 15;

    // Функция, которая добавляет одно фото на фон
    const addPhotoToBackground = () => {
        // --- ОТЛАДОЧНОЕ СООБЩЕНИЕ 3 ---
        console.log(`background.js: Добавляю фото #${posterIndex + 1} на фон.`);

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

    addPhotoToBackground();
    setInterval(addPhotoToBackground, 4000);
});