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

    // --- ЛОГИКА ВИДЖЕТА ---
    const showWidget = (movieName) => {
        widgetMovieName.textContent = `Поиск: ${movieName}`;
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
        
        const poll = async () => {
            try {
                const response = await fetch(`/api/torrent-status/${lotteryId}`);
                const data = await response.json();
                const torrentButton = document.querySelector(`.gallery-item[data-lottery-id="${lotteryId}"] .torrent-button`);

                if (data.status === 'not_found' || data.status === 'error') {
                    if (torrentButton) torrentButton.className = 'torrent-button';
                } else {
                    updateWidget(data);
                    if (torrentButton) {
                        torrentButton.className = 'torrent-button';
                        if (data.status.includes('downloading')) {
                            torrentButton.classList.add('status-downloading');
                        } else if (data.status.includes('seeding') || data.status.includes('completed') || parseFloat(data.progress) >= 100) {
                            torrentButton.classList.add('status-seeding');
                            if (statusPollInterval) clearInterval(statusPollInterval);
                        }
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
    
    // --- НОВАЯ АСИНХРОННАЯ ЛОГИКА СКАЧИВАНИЯ ---
    const handleDownloadRequest = async (lotteryId, movieName) => {
        try {
            // 1. Запускаем поиск и получаем ID задачи
            showWidget(movieName);
            const startResponse = await fetch(`/api/torrent-search/start/${lotteryId}`, { method: 'POST' });
            const startData = await startResponse.json();

            if (!startData.success) {
                alert(startData.message);
                return;
            }
            
            // 2. Опрашиваем статус поиска, пока он не завершится
            const jobId = startData.job_id;
            const searchPollInterval = setInterval(async () => {
                const statusResponse = await fetch(`/api/torrent-search/status/${jobId}`);
                const statusData = await statusResponse.json();

                if (statusData.status === 'completed') {
                    clearInterval(searchPollInterval);
                    if (statusData.found) {
                        // 3. Если найдено - отправляем лучший результат на скачивание
                        const bestTorrent = statusData.best_torrent;
                        const downloadResponse = await fetch('/api/torrent-search/download', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ url: bestTorrent.fileUrl, lottery_id: lotteryId })
                        });
                        const downloadData = await downloadResponse.json();
                        alert(downloadData.message);
                        if(downloadData.success) {
                            // 4. Запускаем опрос статуса уже самой загрузки
                            startTorrentStatusPolling(lotteryId, movieName);
                        }
                    } else {
                        alert('Фильм не найден на трекерах.');
                    }
                } else if (statusData.status === 'failed') {
                    clearInterval(searchPollInterval);
                    alert(`Ошибка поиска: ${statusData.message}`);
                }
                // Если статус 'running', просто ждем следующего опроса
            }, 5000); // Опрос каждые 5 секунд

        } catch (error) {
            alert(`Критическая ошибка при запуске скачивания: ${error}`);
        }
    };
    
    // --- ФОРМАТИРОВАНИЕ ДАТ ---
    dateOverlays.forEach(overlay => {
        const isoDate = overlay.dataset.date;
        if (isoDate) {
            overlay.textContent = new Date(isoDate).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
        }
    });

    // --- ЛОГИКА МОДАЛЬНОГО ОКНА ---
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

                modalWinnerInfo.innerHTML = `
                    <div class="winner-card">
                        <div class="winner-poster">
                            <img src="${winner.poster || 'https://via.placeholder.com/200x300.png?text=No+Image'}" alt="Постер ${winner.name}">
                            ${ratingBadgeHtml}
                        </div>
                        <div class="winner-details">
                            <h2>${winner.name}</h2>
                            <p class="meta-info">${winner.year || ''} / ${winner.genres || 'н/д'} / ${winner.countries || 'н/д'}</p>
                            <p class="description">${winner.description || 'Описание отсутствует.'}</p>
                        </div>
                    </div>
                `;
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
                handleDownloadRequest(lotteryId, movieName);
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

    const closeModal = () => { if(modalOverlay) modalOverlay.style.display = 'none'; };
    if (closeButton) closeButton.addEventListener('click', closeModal);
    if (modalOverlay) modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) closeModal(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && modalOverlay && modalOverlay.style.display !== 'none') closeModal(); });
    
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