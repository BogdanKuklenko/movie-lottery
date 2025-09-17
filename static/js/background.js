// static/js/background.js

document.addEventListener('DOMContentLoaded', () => {
    const rotator = document.querySelector('.background-rotator');
    if (!rotator) return; // Если контейнера нет, ничего не делаем

    let posters = [];
    
    // Этот скрипт универсальный и ищет данные о фильмах в разных переменных,
    // в зависимости от того, на какой странице он был запущен.
    if (typeof movies !== 'undefined' && Array.isArray(movies)) {
        // Для index.html, где есть глобальный массив 'movies'
        posters = movies.map(m => m.poster).filter(Boolean);
    } else if (typeof lotteryData !== 'undefined' && Array.isArray(lotteryData)) {
        // Для play.html, где данные в 'lotteryData'
        posters = lotteryData.map(m => m.poster).filter(Boolean);
    } else if (typeof lottery !== 'undefined' && lottery.movies) {
        // Для result.html, где данные в 'lottery.movies'
        posters = lottery.movies.map(m => m.poster).filter(Boolean);
    }
    
    if (posters.length === 0) return; // Если постеров нет, выходим

    // Создаем div'ы с фоновыми картинками для каждого постера
    posters.forEach(imageUrl => {
        const div = document.createElement('div');
        div.className = 'bg-image';
        div.style.backgroundImage = `url(${imageUrl})`;
        rotator.appendChild(div);
    });

    const bgImages = rotator.querySelectorAll('.bg-image');
    let currentIndex = 0;

    // Если есть хотя бы одна картинка, запускаем "карусель"
    if (bgImages.length > 0) {
        // Сразу показываем первую картинку
        bgImages[currentIndex].classList.add('visible');

        // Устанавливаем таймер для смены картинок
        setInterval(() => {
            // Скрываем текущую картинку
            bgImages[currentIndex].classList.remove('visible');
            // Вычисляем индекс следующей картинки (с зацикливанием)
            currentIndex = (currentIndex + 1) % bgImages.length;
            // Показываем следующую
            bgImages[currentIndex].classList.add('visible');
        }, 7000); // Меняем фон каждые 7 секунд
    }
});