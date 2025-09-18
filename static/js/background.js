// static/js/background.js

document.addEventListener('DOMContentLoaded', () => {
    const rotator = document.querySelector('.background-rotator');
    if (!rotator) return;

    let posters = [];
    
    // Эта часть, как и раньше, универсально собирает все доступные постеры
    if (typeof movies !== 'undefined' && Array.isArray(movies)) {
        posters = movies.map(m => m.poster).filter(Boolean);
    } else if (typeof lotteryData !== 'undefined' && Array.isArray(lotteryData)) {
        posters = lotteryData.map(m => m.poster).filter(Boolean);
    } else if (typeof lottery !== 'undefined' && lottery.movies) {
        posters = lottery.movies.map(m => m.poster).filter(Boolean);
    }
    
    if (posters.length === 0) return;

    // Перемешиваем массив постеров для большего разнообразия
    posters.sort(() => Math.random() - 0.5);

    let posterIndex = 0;
    let zIndexCounter = 1;
    const MAX_PHOTOS = 15; // Максимальное количество фото на экране одновременно

    // Функция, которая добавляет одно фото на фон
    const addPhotoToBackground = () => {
        if (posters.length === 0) return;

        // Если фото на экране слишком много, удаляем самое старое
        if (rotator.children.length >= MAX_PHOTOS) {
            rotator.removeChild(rotator.children[0]);
        }

        const imageUrl = posters[posterIndex];
        const div = document.createElement('div');
        div.className = 'bg-image';
        div.style.backgroundImage = `url(${imageUrl})`;

        // --- Генерируем случайные параметры для фото ---
        const randomTop = Math.random() * 60 + 10; // от 10% до 70% от высоты
        const randomLeft = Math.random() * 70 + 5; // от 5% до 75% от ширины
        const randomRotate = Math.random() * 40 - 20; // от -20 до +20 градусов
        
        div.style.top = `${randomTop}%`;
        div.style.left = `${randomLeft}%`;
        div.style.zIndex = zIndexCounter++; // Каждое новое фото будет поверх старых

        // Устанавливаем финальную трансформацию для анимации
        div.style.setProperty('--final-transform', `rotate(${randomRotate}deg) scale(1)`);
        
        rotator.appendChild(div);

        // Добавляем класс, который запускает анимацию "падения" из style.css
        // Небольшая задержка, чтобы браузер успел отрисовать элемент перед анимацией
        setTimeout(() => {
            div.classList.add('falling');
        }, 10);

        // Переходим к следующему постеру, зацикливая массив
        posterIndex = (posterIndex + 1) % posters.length;
    };

    // Запускаем процесс: добавляем по одному фото каждые 4 секунды
    addPhotoToBackground(); // Добавляем первое фото сразу
    setInterval(addPhotoToBackground, 4000);
});