// static/js/history.js

document.addEventListener('DOMContentLoaded', () => {
    const gallery = document.querySelector('.history-gallery');
    const modalOverlay = document.getElementById('history-modal');
    const closeButton = document.querySelector('.close-button');
    const modalResultView = document.getElementById('modal-result-view');
    const modalWaitView = document.getElementById('modal-wait-view');
    const modalWinnerInfo = document.getElementById('modal-winner-info');
    const modalLoserListContainer = document.getElementById('modal-loser-list');
    const modalLoserList = document.querySelector('#modal-loser-list ul');
    const modalPlayLink = document.getElementById('modal-play-link');
    const telegramShareBtn = document.getElementById('telegram-share-btn');
    const dateOverlays = document.querySelectorAll('.date-overlay');

    const widget = document.getElementById('torrent-status-widget');
    const widgetHeader = widget.querySelector('.widget-header');
    const widgetMovieName = widget.querySelector('#widget-movie-name');
    const widgetProgressBar = widget.querySelector('#widget-progress-bar');
    const widgetProgressText = widget.querySelector('#widget-progress-text');
    const widgetSpeedText = widget.querySelector('#widget-speed-text');
    const widgetEtaText = widget.querySelector('#widget-eta-text');
    let statusPollInterval = null;

    // --- ЛОГИКА ВИДЖЕТА (без изменений) ---
    const showWidget = (movieName) => {
        widgetMovieName.textContent = `Загрузка: ${movieName}`;
        widgetProgressText.textContent = '...';
        widgetSpeedText.textContent = '';
        widgetEtaText.textContent = '';
        widgetProgressBar.style.width = '0%';
        widget.style.display = 'block';
    };

    const updateWidget = (data) => {
        widgetMovieName.textContent = data.name;
        widgetProgressText.textContent = `${data.progress}%`;
        widgetProgressBar.style.width = `${data.progress}%`;
        widgetSpeedText.textContent = `${data.speed} МБ/с`;
        widgetEtaText.textContent = data.eta;
    };

    widgetHeader.addEventListener('click', () => {
        widget.classList.toggle('minimized');
    });

    const startTorrentStatusPolling = (lotteryId, movieName) => {
        if (statusPollInterval) clearInterval(statusPollInterval);
        showWidget(movieName);
        const poll = async () => {
            try {
                const response = await fetch(`/api/torrent-status/${lotteryId}`);
                const data = await response.json();
                const torrentButton = document.querySelector(`.gallery-item[data-lottery-id="${lotteryId}"] .torrent-button`);

                if (data.status === 'not_found' || data.status === 'error') {
                    // Оставляем виджет видимым, но можем показать статус ожидания
                } else {
                    updateWidget(data);
                    if (data.status.includes('seeding') || data.status.includes('completed') || parseFloat(data.progress) >= 100) {
                        if (statusPollInterval) clearInterval(statusPollInterval);
                    }
                }
            } catch (error) {
                console.error("Ошибка при опросе статуса торрента:", error);
                if (statusPollInterval) clearInterval(statusPollInterval);
            }
        };
        poll();
        statusPollInterval = setInterval(poll, 3000);
    };
    
    // --- ОБНОВЛЕННАЯ ЛОГИКА СКАЧИВАНИЯ ---
    const handleDownloadRequest = async (movieId, movieName, lotteryId) => {
        try {
            const response = await fetch(`/api/start-download/${movieId}`, {
                method: 'POST'
            });
            
            const data = await response.json();
            alert(data.message); // Показываем пользователю ответ сервера

            if (data.success) {
                // Если загрузка началась, запускаем опрос статуса виджета
                startTorrentStatusPolling(lotteryId, movieName);
            }
            
        } catch (error) {
            console.error('Критическая ошибка при запуске скачивания:', error);
            alert(`Критическая ошибка: ${error.message}`);
        }
    };
    
    // --- ФОРМАТИРОВАНИЕ ДАТ (без изменений) ---
    dateOverlays.forEach(overlay => {
        const isoDate = overlay.dataset.date;
        if (isoDate) {
            overlay.textContent = new Date(isoDate).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
        }
    });

    // --- ОБНОВЛЕННАЯ ЛОГИКА МОДАЛЬНОГО ОКНА ---
    const openModal = async (lotteryId) => {
        modalOverlay.style.display = 'flex';
        modalWinnerInfo.innerHTML = '<div class="loader"></div>';
        modalResultView.style.display = 'block';
        modalWaitView.style.display = 'none';
        modalLoserListContainer.style.display = 'none';

        try {
            const response = await fetch(`/api/result/${lotteryId}`);
            if (!response.ok) throw new Error('Ошибка сети');
            const data = await response.json();
            if (data.error) throw new Error(data.error);

            if (data.result) {
                const winner = data.result;
                const hasRating = winner.rating_kp && winner.rating_kp > 0;
                const ratingClass = hasRating ? (winner.rating_kp >= 7 ? 'rating-high' : winner.rating_kp >= 5 ? 'rating-medium' : 'rating-low') : '';
                const ratingBadgeHtml = hasRating ? `<div class="rating-badge ${ratingClass}">${winner.rating_kp.toFixed(1)}</div>` : '';

                // --- НОВОЕ: Отображение информации о торренте ---
                const torrentInfoHtml = winner.has_magnet 
                    ? `<p class="meta-info torrent-info">✅ Торрент найден: <strong>${winner.quality || 'N/A'}</strong> / Сиды: <strong>${winner.seeds || '?'}</strong></p>`
                    : `<p class="meta-info torrent-info">⏳ Идет поиск торрента...</p>`;

                modalWinnerInfo.innerHTML = `
                    <div class="winner-card">
                        <div class="winner-poster">
                            <img src="${winner.poster || 'https://via.placeholder.com/200x300.png?text=No+Image'}" alt="Постер ${winner.name}">
                            ${ratingBadgeHtml}
                        </div>
                        <div class="winner-details">
                            <h2>${winner.name}</h2>
                            <p class="meta-info">${winner.year || ''} / ${winner.genres || 'н/д'} / ${winner.countries || 'н/д'}</p>
                            ${torrentInfoHtml}
                            <p class="description">${winner.description || 'Описание отсутствует.'}</p>
                        </div>
                    </div>
                `;

                const losers = data.movies.filter(movie => movie.id !== winner.id);
                modalLoserList.innerHTML = '';
                if (losers.length > 0) {
                    losers.forEach(loser => {
                        const li = document.createElement('li');
                        li.className = 'loser-item';
                        // --- НОВОЕ: Отображение статуса торрента для проигравших ---
                        const loserTorrentInfo = loser.has_magnet
                            ? `<span class="loser-quality">${loser.quality || ''}</span>`
                            : `<div class="loader-small-inline"></div>`;
                        li.innerHTML = `
                            <div class="loser-poster-container">
                                <img class="loser-poster" src="${loser.poster || 'https://via.placeholder.com/40x60.png?text=?'}" alt="${loser.name}">
                                ${loserTorrentInfo}
                            </div>
                            <span class="loser-name">${loser.name}</span>`;
                        modalLoserList.appendChild(li);
                    });
                    modalLoserListContainer.style.display = 'block';
                }
            } else {
                 modalResultView.style.display = 'none';
                 modalWaitView.style.display = 'block';
                 const playUrl = data.play_url;
                 modalPlayLink.value = playUrl;
                 const text = encodeURIComponent('Привет! Предлагаю тебе определить, какой фильм мы посмотрим. Нажми на ссылку и испытай удачу!');
                 const url = encodeURIComponent(playUrl);
                 telegramShareBtn.href = `https://t.me/share/url?url=${url}&text=${text}`;
            }
        } catch (error) {
            modalWinnerInfo.innerHTML = `<p class="error-message">Не удалось загрузить детали лотереи. Ошибка: ${error.message}</p>`;
            console.error(error);
        }
    };
    
    // --- ОБНОВЛЕННАЯ ЛОГИКА УДАЛЕНИЯ (без изменений) ---
    const deleteLottery = async (lotteryId, cardElement) => {
        try {
            const response = await fetch(`/delete-lottery/${lotteryId}`, { method: 'POST' });
            const data = await response.json();
            if (!data.success) throw new Error(data.message || 'Ошибка на сервере');
            cardElement.classList.add('is-deleting');
            setTimeout(() => cardElement.remove(), 500);
        } catch (error) {
            console.error('Ошибка при удалении лотереи:', error);
            alert('Не удалось удалить лотерею.');
        }
    };

    // --- ОБНОВЛЕННЫЙ ОБРАБОТЧИК КЛИКОВ ---
    if (gallery) {
        gallery.addEventListener('click', (e) => {
            const torrentButton = e.target.closest('.torrent-button');
            const deleteButton = e.target.closest('.delete-button');
            const galleryItem = e.target.closest('.gallery-item');
            if (!galleryItem) return;

            const lotteryId = galleryItem.dataset.lotteryId;
            const movieId = galleryItem.dataset.movieId; // Используем ID фильма
            const movieName = galleryItem.dataset.movieName;

            if (torrentButton) {
                e.stopPropagation();
                handleDownloadRequest(movieId, movieName, lotteryId);
            } else if (deleteButton) {
                e.stopPropagation();
                if (confirm('Вы уверены, что хотите удалить эту лотерею?')) {
                    deleteLottery(lotteryId, galleryItem);
                }
            } else {
                openModal(lotteryId);
            }
        });
    }

    // --- ЛОГИКА ЗАКРЫТИЯ МОДАЛЬНОГО ОКНА (без изменений) ---
    const closeModal = () => { if(modalOverlay) modalOverlay.style.display = 'none'; };
    if (closeButton) closeButton.addEventListener('click', closeModal);
    if (modalOverlay) modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) closeModal(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && modalOverlay && modalOverlay.style.display !== 'none') closeModal(); });
    
    // --- ОБНОВЛЕННАЯ ЛОГИКА ОПРОСА ---
    const startHistoryPolling = () => {
        const pollableCards = document.querySelectorAll('.gallery-item[data-pollable="true"]');
        if (pollableCards.length === 0) return;

        let pollableIds = Array.from(pollableCards).map(card => card.dataset.lotteryId);
        
        const pollInterval = setInterval(async () => {
            const currentIds = [...new Set(pollableIds)]; // Копируем и убираем дубликаты
            if (currentIds.length === 0) {
                clearInterval(pollInterval);
                return;
            }

            for (const id of currentIds) {
                try {
                    const response = await fetch(`/api/result/${id}`);
                    const data = await response.json();
                    
                    // Обновляем карточку, если розыгрыш состоялся
                    if (data.result) {
                        const card = document.querySelector(`.gallery-item[data-lottery-id="${id}"]`);
                        if(card && card.classList.contains('waiting-card')){
                             updateCardOnPage(id, data.result);
                        }
                    }

                    // Обновляем инфо о торрентах для всех фильмов в лотерее
                    data.movies.forEach(movie => {
                         if (movie.has_magnet) {
                            const movieCard = document.querySelector(`.gallery-item[data-movie-id="${movie.id}"]`);
                            if (movieCard) {
                                const torrentBtn = movieCard.querySelector('.torrent-button');
                                if(torrentBtn) torrentBtn.disabled = false;
                            }
                         }
                    });

                    // Если все фильмы в лотерее имеют magnet, прекращаем опрос для этой лотереи
                    const allMagnetsFound = data.movies.every(m => m.has_magnet);
                    const isDrawn = !!data.result;
                    if (isDrawn && allMagnetsFound) {
                        pollableIds = pollableIds.filter(pollId => pollId !== id);
                    }

                } catch (error) {
                    console.error(`Ошибка при опросе лотереи ${id}:`, error);
                    // Удаляем ID из опроса при ошибке, чтобы не спамить
                    pollableIds = pollableIds.filter(pollId => pollId !== id);
                }
            }
        }, 7000);
    };

    // --- ОБНОВЛЕННАЯ ФУНКЦИЯ ОБНОВЛЕНИЯ КАРТОЧКИ ---
    const updateCardOnPage = (lotteryId, winnerData) => {
        const card = document.querySelector(`.waiting-card[data-lottery-id="${lotteryId}"]`);
        if (!card) return;
        
        card.className = 'gallery-item'; // Убираем класс ожидания
        card.dataset.movieId = winnerData.id; // Добавляем ID фильма
        card.dataset.movieName = winnerData.name;
        
        // Кнопка скачивания изначально неактивна, пока поллинг не подтвердит наличие magnet
        const torrentButtonHtml = `<button class="torrent-button" title="Скачать фильм" disabled>&#x2913;</button>`;

        card.innerHTML = `
            <div class="action-buttons">
                ${torrentButtonHtml}
                <button class="delete-button" title="Удалить лотерею">&times;</button>
            </div>
            <img src="${winnerData.poster || 'https://via.placeholder.com/200x300.png?text=No+Image'}" alt="${winnerData.name}">
            <div class="date-overlay" data-date="${winnerData.createdAt}">
                ${new Date(winnerData.createdAt).toLocaleDateString('ru-RU', {day: '2-digit', month: '2-digit', year: 'numeric'})}
            </div>
        `;
    };
    
    startHistoryPolling();
});