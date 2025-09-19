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

    // --- ЭЛЕМЕНТЫ ДЛЯ ВИДЖЕТА ---
    const widget = document.getElementById('torrent-status-widget');
    const widgetHeader = widget.querySelector('.widget-header');
    const widgetMovieName = widget.querySelector('#widget-movie-name');
    const widgetProgressBar = widget.querySelector('#widget-progress-bar');
    const widgetProgressText = widget.querySelector('#widget-progress-text');
    const widgetSpeedText = widget.querySelector('#widget-speed-text');
    const widgetEtaText = widget.querySelector('#widget-eta-text');
    let statusPollInterval = null;

    // --- ЛОГИКА ВИДЖЕТА ---
    const showWidget = (movieName) => {
        widgetMovieName.textContent = movieName;
        widget.style.display = 'block';
    };

    const updateWidget = (data) => {
        widgetProgressText.textContent = `${data.progress}%`;
        widgetProgressBar.style.width = `${data.progress}%`;
        widgetSpeedText.textContent = `${data.speed} МБ/с`;
        widgetEtaText.textContent = data.eta;
    };

    widgetHeader.addEventListener('click', () => {
        widget.classList.toggle('minimized');
    });

    const startPolling = (lotteryId, movieName) => {
        if (statusPollInterval) clearInterval(statusPollInterval);

        const poll = async () => {
            try {
                const response = await fetch(`/api/torrent-status/${lotteryId}`);
                if (!response.ok) throw new Error('Network response was not ok');
                const data = await response.json();
                
                const torrentButton = document.querySelector(`.gallery-item[data-lottery-id="${lotteryId}"] .torrent-button`);
                if (!torrentButton) return;

                if (data.status === 'not_found' || data.status === 'error') {
                    torrentButton.className = 'torrent-button';
                } else {
                    updateWidget(data);
                    torrentButton.className = 'torrent-button'; // Reset
                    if (data.status.includes('downloading')) {
                        torrentButton.classList.add('status-downloading');
                    } else if (data.status.includes('seeding') || data.status.includes('completed') || parseFloat(data.progress) >= 100) {
                        torrentButton.classList.add('status-seeding');
                        if (statusPollInterval) clearInterval(statusPollInterval); // Stop polling
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

    // --- ФОРМАТИРОВАНИЕ ДАТ ---
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

            // Отрисовываем победителя, если он есть
            if (data.result) {
                const winner = data.result;
                const ratingClass = winner.rating_kp >= 7 ? 'rating-high' : winner.rating_kp >= 5 ? 'rating-medium' : 'rating-low';
                
                modalWinnerInfo.innerHTML = `
                    <div class="winner-card">
                        <div class="winner-poster">
                            <img src="${winner.poster || 'https://via.placeholder.com/200x300.png?text=No+Image'}" alt="Постер ${winner.name}">
                            ${winner.rating_kp ? `<div class="rating-badge ${ratingClass}">${winner.rating_kp.toFixed(1)}</div>` : ''}
                        </div>
                        <div class="winner-details">
                            <h2>${winner.name}</h2>
                            <p class="meta-info">${winner.year || ''} / ${winner.genres || 'н/д'} / ${winner.countries || 'н/д'}</p>
                            <p class="description">${winner.description || 'Описание отсутствует.'}</p>
                        </div>
                    </div>
                `;

                // Отрисовываем проигравших
                const losers = data.movies.filter(movie => movie.name !== winner.name);
                modalLoserList.innerHTML = '';
                if (losers.length > 0) {
                    losers.forEach(loser => {
                        const li = document.createElement('li');
                        li.className = 'loser-item';
                        li.innerHTML = `<img class="loser-poster" src="${loser.poster || 'https://via.placeholder.com/40x60.png?text=?'}" alt="${loser.name}"><span class="loser-name">${loser.name}</span>`;
                        modalLoserList.appendChild(li);
                    });
                    modalLoserListContainer.style.display = 'block';
                }
            } else { // Если розыгрыш еще не состоялся
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

    // --- ЛОГИКА УДАЛЕНИЯ ---
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

    // --- ОБРАБОТЧИК КЛИКОВ ПО ГАЛЕРЕЕ ---
    if (gallery) {
        gallery.addEventListener('click', (e) => {
            const torrentButton = e.target.closest('.torrent-button');
            const deleteButton = e.target.closest('.delete-button');
            const galleryItem = e.target.closest('.gallery-item');

            if (!galleryItem) return;

            const lotteryId = galleryItem.dataset.lotteryId;
            const movieName = galleryItem.dataset.movieName;

            if (torrentButton) {
                e.stopPropagation();
                fetch(`/api/start-download/${lotteryId}`, { method: 'POST' })
                    .then(res => res.json())
                    .then(data => {
                        alert(data.message);
                        if(data.success) {
                            showWidget(movieName);
                            startPolling(lotteryId, movieName);
                        }
                    });
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

    // --- ЗАКРЫТИЕ МОДАЛЬНОГО ОКНА ---
    const closeModal = () => { modalOverlay.style.display = 'none'; };
    closeButton.addEventListener('click', closeModal);
    modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) closeModal(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && modalOverlay.style.display !== 'none') closeModal(); });

    // --- ОБНОВЛЕНИЕ СТАТУСА ОЖИДАЮЩИХ ЛОТЕРЕЙ ---
    const startHistoryPolling = () => {
        const waitingCards = document.querySelectorAll('.waiting-card');
        if (waitingCards.length === 0) return;
        let waitingIds = Array.from(waitingCards).map(card => card.dataset.lotteryId);
        const pollInterval = setInterval(async () => {
            if (waitingIds.length === 0) {
                clearInterval(pollInterval);
                return;
            }
            for (const id of waitingIds) {
                try {
                    const response = await fetch(`/api/result/${id}`);
                    const data = await response.json();
                    if (data.result) {
                        updateCardOnPage(id, data);
                        waitingIds = waitingIds.filter(waitingId => waitingId !== id);
                    }
                } catch (error) {
                    console.error(`Failed to poll lottery ${id}:`, error);
                }
            }
        }, 7000);
    };

    const updateCardOnPage = (lotteryId, lotteryData) => {
        const card = document.querySelector(`.waiting-card[data-lottery-id="${lotteryId}"]`);
        if (!card) return;
        card.className = 'gallery-item';
        card.dataset.movieName = lotteryData.result.name;
        card.innerHTML = `
            <div class="action-buttons">
                <button class="torrent-button" title="Скачать фильм">&#x2913;</button>
                <button class="delete-button" title="Удалить лотерею">&times;</button>
            </div>
            <img src="${lotteryData.result.poster || 'https://via.placeholder.com/200x300.png?text=No+Image'}" alt="${lotteryData.result.name}">
            <div class="date-overlay" data-date="${lotteryData.createdAt}">
                ${new Date(lotteryData.createdAt).toLocaleDateString('ru-RU', {day: '2-digit', month: '2-digit', year: 'numeric'})}
            </div>
        `;
    };
    
    startHistoryPolling();
});