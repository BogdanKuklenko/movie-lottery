// static/js/history.js

document.addEventListener('DOMContentLoaded', () => {
    // --- Получаем все необходимые элементы со страницы ---
    const gallery = document.querySelector('.history-gallery');
    const modalOverlay = document.getElementById('history-modal');
    
    // Элементы внутри модального окна
    const closeButton = document.querySelector('.close-button');
    const modalResultView = document.getElementById('modal-result-view');
    const modalWaitView = document.getElementById('modal-wait-view');
    const modalWinnerInfo = document.getElementById('modal-winner-info');
    const modalLoserList = document.querySelector('#modal-loser-list ul');
    const modalPlayLink = document.getElementById('modal-play-link');
    const telegramShareBtn = document.getElementById('telegram-share-btn');

    const dateOverlays = document.querySelectorAll('.date-overlay');

    // --- 1. Форматирование дат на постерах (без изменений) ---
    dateOverlays.forEach(overlay => {
        const isoDate = overlay.dataset.date;
        if (isoDate) {
            const date = new Date(isoDate);
            overlay.textContent = date.toLocaleDateString('ru-RU', {
                day: '2-digit', month: '2-digit', year: 'numeric'
            });
        }
    });

    // --- 2. Логика открытия модального окна (полностью переписана) ---
    const openModal = async (lotteryId) => {
        // Показываем оверлей и скрываем оба вида контента
        modalOverlay.style.display = 'flex';
        modalResultView.style.display = 'none';
        modalWaitView.style.display = 'none';
        
        // Показываем лоадер в блоке для результатов, так как он общий
        modalWinnerInfo.innerHTML = '<div class="loader"></div>';
        modalLoserList.innerHTML = '';

        try {
            const response = await fetch(`/api/result/${lotteryId}`);
            const data = await response.json();
            if (data.error) throw new Error(data.error);

            if (data.result) {
                // --- ЛОГИКА ДЛЯ ЗАВЕРШЕННОЙ ЛОТЕРЕИ ---
                const winner = data.result;
                const losers = data.movies.filter(movie => movie.name !== winner.name);

                // Заполняем информацию о победителе
                modalWinnerInfo.innerHTML = `
                    <div class="result-card">
                        <img src="${winner.poster || 'https://via.placeholder.com/200x300.png?text=No+Image'}" alt="Постер ${winner.name}">
                        <h3>${winner.name}</h3>
                        <p>${winner.year}</p>
                    </div>
                `;
                // Заполняем список проигравших
                if (losers.length > 0) {
                    losers.forEach(loser => {
                        const li = document.createElement('li');
                        li.textContent = loser.name;
                        modalLoserList.appendChild(li);
                    });
                    document.getElementById('modal-loser-list').style.display = 'block';
                } else {
                    document.getElementById('modal-loser-list').style.display = 'none';
                }
                // Показываем блок с результатами
                modalResultView.style.display = 'block';

            } else {
                // --- ЛОГИКА ДЛЯ ОЖИДАЮЩЕЙ ЛОТЕРЕИ ---
                const playUrl = data.play_url;
                modalPlayLink.value = playUrl;

                // Формируем ссылку для Telegram
                const text = encodeURIComponent('Привет! Предлагаю тебе определить, какой фильм мы посмотрим. Нажми на ссылку и испытай удачу!');
                const url = encodeURIComponent(playUrl);
                telegramShareBtn.href = `https://t.me/share/url?url=${url}&text=${text}`;

                // Показываем блок с ожиданием
                modalWaitView.style.display = 'block';
            }

        } catch (error) {
            modalResultView.style.display = 'block'; // Показываем блок с результатами для вывода ошибки
            modalWinnerInfo.innerHTML = `<p class="error-message">Не удалось загрузить детали лотереи.</p>`;
            console.error(error);
        }
    };

    // Обработчик клика на галерею (без изменений)
    if (gallery) {
        gallery.addEventListener('click', (e) => {
            const galleryItem = e.target.closest('.gallery-item') || e.target.closest('.waiting-card');
            if (galleryItem) {
                const lotteryId = galleryItem.dataset.lotteryId;
                openModal(lotteryId);
            }
        });
    }

    // --- 3. Логика закрытия модального окна (без изменений) ---
    const closeModal = () => {
        modalOverlay.style.display = 'none';
    };
    closeButton.addEventListener('click', closeModal);
    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) closeModal();
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modalOverlay.style.display !== 'none') closeModal();
    });
});