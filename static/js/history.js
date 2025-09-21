// static/js/history.js

document.addEventListener('DOMContentLoaded', () => {
    const gallery = document.querySelector('.history-gallery');
    const modalOverlay = document.getElementById('history-modal');
    const closeButton = document.querySelector('.close-button');
    const modalWinnerInfo = document.getElementById('modal-winner-info');
    const modalParticipantsContainer = document.getElementById('modal-participants');
    const modalParticipantsList = modalParticipantsContainer ? modalParticipantsContainer.querySelector('.participants-list') : null;

    const widget = document.getElementById('torrent-status-widget');
    const widgetHeader = widget ? widget.querySelector('.widget-header') : null;
    const widgetDownloadsContainer = widget ? widget.querySelector('#widget-downloads') : null;
    const widgetEmptyText = widget ? widget.querySelector('.widget-empty') : null;

    const ACTIVE_DOWNLOADS_KEY = 'lotteryActiveDownloads';
    const pollIntervals = new Map();
    const activeDownloads = new Map();

    const saveActiveDownloads = () => {
        if (!widget) return;
        const payload = Array.from(activeDownloads.values()).map((entry) => ({
            lotteryId: entry.lotteryId,
            movieName: entry.movieName,
            kinopoiskId: entry.kinopoiskId || null,
        }));
        localStorage.setItem(ACTIVE_DOWNLOADS_KEY, JSON.stringify(payload));
    };

    const ensureWidgetState = () => {
        if (!widget) return;
        const hasDownloads = activeDownloads.size > 0;
        widget.style.display = hasDownloads ? 'block' : 'none';
        if (widgetEmptyText) widgetEmptyText.style.display = hasDownloads ? 'none' : 'block';
        if (widgetDownloadsContainer) widgetDownloadsContainer.style.display = hasDownloads ? 'block' : 'none';
        if (hasDownloads) {
            widget.classList.remove('minimized');
        }
    };

    const getOrCreateDownloadElement = (lotteryId) => {
        if (!widgetDownloadsContainer) return null;
        let item = widgetDownloadsContainer.querySelector(`[data-lottery-id="${lotteryId}"]`);
        if (!item) {
            item = document.createElement('div');
            item.className = 'widget-download';
            item.dataset.lotteryId = lotteryId;
            item.innerHTML = `
                <h5 class="widget-download-title"></h5>
                <div class="progress-bar-container">
                    <div class="progress-bar"></div>
                </div>
                <div class="widget-stats">
                    <span class="progress-text">0%</span>
                    <span class="speed-text">0.00 МБ/с</span>
                    <span class="eta-text">--:--</span>
                </div>
                <div class="widget-stats-bottom">
                    <span class="peers-text">Сиды: 0 / Пиры: 0</span>
                </div>
            `;
            widgetDownloadsContainer.appendChild(item);
        }
        return item;
    };

    const registerDownload = (lotteryId, movieName, kinopoiskId, { skipSave = false } = {}) => {
        if (!lotteryId) return;
        const existing = activeDownloads.get(lotteryId) || {};
        const updated = {
            lotteryId,
            movieName: movieName || existing.movieName || 'Загрузка...',
            kinopoiskId: kinopoiskId || existing.kinopoiskId || null,
        };
        activeDownloads.set(lotteryId, updated);

        const element = getOrCreateDownloadElement(lotteryId);
        if (element) {
            const title = element.querySelector('.widget-download-title');
            if (title) {
                title.textContent = `Загрузка: ${updated.movieName}`;
            }
        }

        ensureWidgetState();
        if (!skipSave) saveActiveDownloads();
        return updated;
    };

    const removeDownload = (lotteryId) => {
        if (pollIntervals.has(lotteryId)) {
            clearInterval(pollIntervals.get(lotteryId));
            pollIntervals.delete(lotteryId);
        }
        if (activeDownloads.has(lotteryId)) {
            activeDownloads.delete(lotteryId);
            saveActiveDownloads();
        }
        if (widgetDownloadsContainer) {
            const element = widgetDownloadsContainer.querySelector(`[data-lottery-id="${lotteryId}"]`);
            if (element) {
                element.remove();
            }
        }
        ensureWidgetState();
    };

    const updateDownloadView = (lotteryId, data) => {
        if (!widgetDownloadsContainer) return;
        const element = widgetDownloadsContainer.querySelector(`[data-lottery-id="${lotteryId}"]`);
        if (!element) return;

        const title = element.querySelector('.widget-download-title');
        const bar = element.querySelector('.progress-bar');
        const progressText = element.querySelector('.progress-text');
        const speedText = element.querySelector('.speed-text');
        const etaText = element.querySelector('.eta-text');
        const peersText = element.querySelector('.peers-text');

        if (data.name && title) {
            title.textContent = `Загрузка: ${data.name}`;
        }

        if (data.status === 'error') {
            if (progressText) progressText.textContent = 'Ошибка';
            if (speedText) speedText.textContent = '-';
            if (etaText) etaText.textContent = '-';
            if (peersText) peersText.textContent = data.message || '';
            if (bar) bar.style.width = '0%';
            return;
        }

        if (data.status === 'not_found') {
            if (progressText) progressText.textContent = 'Ожидание...';
            if (speedText) speedText.textContent = '0.00 МБ/с';
            if (etaText) etaText.textContent = '--:--';
            if (peersText) peersText.textContent = 'Торрент не найден';
            if (bar) bar.style.width = '0%';
            return;
        }

        if (bar) bar.style.width = `${data.progress}%`;
        if (progressText) progressText.textContent = `${data.progress}%`;
        if (speedText) speedText.textContent = `${data.speed} МБ/с`;
        if (etaText) etaText.textContent = data.eta;
        if (peersText) peersText.textContent = `Сиды: ${data.seeds} / Пиры: ${data.peers}`;
    };

    const markDownloadCompleted = (lotteryId) => {
        if (!widgetDownloadsContainer) return;
        const element = widgetDownloadsContainer.querySelector(`[data-lottery-id="${lotteryId}"]`);
        if (!element) return;

        const bar = element.querySelector('.progress-bar');
        const progressText = element.querySelector('.progress-text');
        const speedText = element.querySelector('.speed-text');
        const etaText = element.querySelector('.eta-text');
        const peersText = element.querySelector('.peers-text');

        if (bar) bar.style.width = '100%';
        if (progressText) progressText.textContent = '100%';
        if (speedText) speedText.textContent = 'Готово';
        if (etaText) etaText.textContent = '--';
        if (peersText) peersText.textContent = 'Раздача';

        setTimeout(() => removeDownload(lotteryId), 5000);
    };

    const startTorrentStatusPolling = (lotteryId, movieName, kinopoiskId) => {
        if (!lotteryId) return;
        registerDownload(lotteryId, movieName, kinopoiskId);

        if (pollIntervals.has(lotteryId)) {
            clearInterval(pollIntervals.get(lotteryId));
        }

        const poll = async () => {
            try {
                const response = await fetch(`/api/torrent-status/${lotteryId}`);
                const data = await response.json();

                if (data.status === 'error') {
                    updateDownloadView(lotteryId, data);
                    if (pollIntervals.has(lotteryId)) {
                        clearInterval(pollIntervals.get(lotteryId));
                        pollIntervals.delete(lotteryId);
                    }
                    return;
                }

                updateDownloadView(lotteryId, data);

                if (data.status && (data.status.includes('seeding') || data.status.includes('completed') || parseFloat(data.progress) >= 100)) {
                    if (pollIntervals.has(lotteryId)) {
                        clearInterval(pollIntervals.get(lotteryId));
                        pollIntervals.delete(lotteryId);
                    }
                    markDownloadCompleted(lotteryId);
                }
            } catch (error) {
                console.error('Ошибка при опросе статуса торрента:', error);
                updateDownloadView(lotteryId, { status: 'error', message: 'Нет связи с qBittorrent' });
                if (pollIntervals.has(lotteryId)) {
                    clearInterval(pollIntervals.get(lotteryId));
                    pollIntervals.delete(lotteryId);
                }
            }
        };

        poll();
        const intervalId = setInterval(poll, 3000);
        pollIntervals.set(lotteryId, intervalId);
    };

    const initializeStoredDownloads = () => {
        if (!widget) return;
        try {
            const stored = JSON.parse(localStorage.getItem(ACTIVE_DOWNLOADS_KEY) || '[]');
            stored.forEach((entry) => {
                if (!entry || !entry.lotteryId) return;
                startTorrentStatusPolling(entry.lotteryId, entry.movieName, entry.kinopoiskId);
            });
        } catch (error) {
            console.warn('Не удалось восстановить активные загрузки:', error);
            localStorage.removeItem(ACTIVE_DOWNLOADS_KEY);
        }
    };

    if (widgetHeader) {
        widgetHeader.addEventListener('click', () => {
            widget.classList.toggle('minimized');
        });
    }

    // --- ЛОГИКА ВЗАИМОДЕЙСТВИЯ С КНОПКАМИ КАРТОЧЕК ---

    const handleSearchClick = (movieName, movieYear) => {
        const query = encodeURIComponent(`${movieName} (${movieYear})`);
        const searchUrl = `https://rutracker.org/forum/tracker.php?nm=${query}`;
        window.open(searchUrl, '_blank');
    };

    const handleDownloadClick = async (kinopoiskId, movieName, lotteryId) => {
        registerDownload(lotteryId, movieName, kinopoiskId);
        try {
            const response = await fetch(`/api/start-download/${kinopoiskId}`, { method: 'POST' });
            const data = await response.json();
            if (data.success) {
                startTorrentStatusPolling(lotteryId, movieName, kinopoiskId);
            } else {
                alert(`Ошибка: ${data.message}`);
                removeDownload(lotteryId);
            }
        } catch (error) {
            console.error('Ошибка при запуске скачивания:', error);
            alert('Произошла критическая ошибка.');
            removeDownload(lotteryId);
        }
    };

    const handleSaveMagnet = async (kinopoiskId, magnetLink) => {
        try {
            const response = await fetch('/api/movie-magnet', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ kinopoisk_id: kinopoiskId, magnet_link: magnetLink })
            });
            const data = await response.json();
            alert(data.message);
            if (data.success) {
                closeModal();
                location.reload();
            }
        } catch (error) {
            console.error('Ошибка при сохранении magnet-ссылки:', error);
            alert('Произошла критическая ошибка.');
        }
    };

    const handleDeleteLottery = async (lotteryId, cardElement) => {
        if (!confirm('Вы уверены, что хотите удалить эту лотерею? Торрент и скачанные файлы также будут удалены из qBittorrent.')) {
            return;
        }
        try {
            const response = await fetch(`/delete-lottery/${lotteryId}`, { method: 'POST' });
            const data = await response.json();
            alert(data.message);
            if (data.success) {
                cardElement.classList.add('is-deleting');
                removeDownload(lotteryId);
                setTimeout(() => cardElement.remove(), 500);
            }
        } catch (error) {
            console.error('Ошибка при удалении лотереи:', error);
            alert('Не удалось удалить лотерею.');
        }
    };

    // --- МОДАЛЬНОЕ ОКНО ---

    const renderParticipantsList = (movies, winnerName) => {
        if (!modalParticipantsContainer || !modalParticipantsList) return;
        if (!movies || !movies.length) {
            modalParticipantsContainer.style.display = 'none';
            modalParticipantsList.innerHTML = '';
            return;
        }

        modalParticipantsContainer.style.display = 'block';
        modalParticipantsList.innerHTML = '';

        movies.forEach((movie) => {
            const item = document.createElement('li');
            item.className = 'participant-item';
            if (movie.name === winnerName) {
                item.classList.add('winner');
            }

            item.innerHTML = `
                <img class="participant-poster" src="${movie.poster || 'https://via.placeholder.com/100x150.png?text=No+Image'}" alt="${movie.name}">
                <span class="participant-name">${movie.name}</span>
                <span class="participant-meta">${movie.year || ''}</span>
                ${movie.name === winnerName ? '<span class="participant-winner-badge">Победитель</span>' : ''}
            `;

            modalParticipantsList.appendChild(item);
        });
    };

    const openModal = async (lotteryId) => {
        if (!modalOverlay) return;
        modalOverlay.style.display = 'flex';
        modalWinnerInfo.innerHTML = '<div class="loader"></div>';
        if (modalParticipantsContainer) {
            modalParticipantsContainer.style.display = 'none';
        }
        if (modalParticipantsList) {
            modalParticipantsList.innerHTML = '';
        }

        try {
            const response = await fetch(`/api/result/${lotteryId}`);
            if (!response.ok) throw new Error('Ошибка сети');
            const data = await response.json();
            if (data.error) throw new Error(data.error);

            renderParticipantsList(data.movies || [], data.result ? data.result.name : null);

            if (data.result) {
                renderWinnerCard(data.result);
            } else {
                const playUrl = data.play_url;
                const text = encodeURIComponent('Привет! Предлагаю тебе определить, какой фильм мы посмотрим. Нажми на ссылку и испытай удачу!');
                const url = encodeURIComponent(playUrl);
                const telegramHref = `https://t.me/share/url?url=${url}&text=${text}`;

                modalWinnerInfo.innerHTML = `
                    <h3>Лотерея ожидает розыгрыша</h3>
                    <p>Поделитесь ссылкой с другом, чтобы он мог выбрать фильм.</p>
                    <div class="link-box">
                        <label for="play-link-modal">Ссылка для друга:</label>
                        <input type="text" id="play-link-modal" value="${playUrl}" readonly>
                        <button class="copy-btn" data-target="play-link-modal">Копировать</button>
                    </div>
                    <a href="${telegramHref}" class="action-button-tg" target="_blank">
                        Поделиться в Telegram
                    </a>
                `;

                const copyBtn = modalWinnerInfo.querySelector('.copy-btn');
                if (copyBtn) {
                    copyBtn.addEventListener('click', (e) => {
                        const targetId = e.target.dataset.target;
                        const input = document.getElementById(targetId);
                        if (!input) return;
                        input.select();
                        document.execCommand('copy');
                        e.target.textContent = 'Скопировано!';
                        setTimeout(() => { e.target.textContent = 'Копировать'; }, 2000);
                    });
                }
            }
        } catch (error) {
            modalWinnerInfo.innerHTML = `<p class="error-message">Не удалось загрузить детали: ${error.message}</p>`;
        }
    };

    const renderWinnerCard = (winner) => {
        const ratingValue = typeof winner.rating_kp === 'number' ? winner.rating_kp : 0;
        const ratingClass = ratingValue >= 7 ? 'rating-high' : ratingValue >= 5 ? 'rating-medium' : 'rating-low';
        const ratingBadgeHtml = ratingValue ? `<div class="rating-badge ${ratingClass}">${ratingValue.toFixed(1)}</div>` : '';

        const magnetFormHtml = `
            <div class="magnet-form">
                <label for="magnet-input">Magnet-ссылка:</label>
                <input type="text" id="magnet-input" value="${winner.magnet_link || ''}" placeholder="Вставьте magnet-ссылку и нажмите Сохранить...">
                <div class="magnet-actions">
                    <button class="action-button save-magnet-btn">Сохранить</button>
                    ${winner.has_magnet ? '<button class="action-button-delete delete-magnet-btn">Удалить ссылку</button>' : ''}
                </div>
            </div>
        `;

        modalWinnerInfo.innerHTML = `
            <div class="winner-card">
                <div class="winner-poster">
                    <img src="${winner.poster || ''}" alt="Постер ${winner.name}">
                    ${ratingBadgeHtml}
                </div>
                <div class="winner-details">
                    <h2>${winner.name} (${winner.year})</h2>
                    <p class="meta-info">${winner.genres || 'н/д'} / ${winner.countries || 'н/д'}</p>
                    <p class="description">${winner.description || 'Описание отсутствует.'}</p>
                    ${magnetFormHtml}
                </div>
            </div>
        `;

        const saveBtn = modalWinnerInfo.querySelector('.save-magnet-btn');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => {
                const input = modalWinnerInfo.querySelector('#magnet-input');
                handleSaveMagnet(winner.kinopoisk_id, input ? input.value : '');
            });
        }

        const deleteBtn = modalWinnerInfo.querySelector('.delete-magnet-btn');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', () => {
                if (confirm('Вы уверены, что хотите удалить сохраненную magnet-ссылку?')) {
                    handleSaveMagnet(winner.kinopoisk_id, '');
                }
            });
        }
    };

    if (gallery) {
        gallery.addEventListener('click', (e) => {
            const galleryItem = e.target.closest('.gallery-item');
            if (!galleryItem) return;

            const { lotteryId, kinopoiskId, movieName, movieYear } = galleryItem.dataset;
            const isDownloadButton = e.target.classList.contains('download-button');
            const isSearchButton = e.target.classList.contains('search-button');
            const isDeleteButton = e.target.classList.contains('delete-button');

            e.stopPropagation();

            if (isDownloadButton) {
                handleDownloadClick(kinopoiskId, movieName, lotteryId);
            } else if (isSearchButton) {
                handleSearchClick(movieName, movieYear);
            } else if (isDeleteButton) {
                handleDeleteLottery(lotteryId, galleryItem);
            } else {
                openModal(lotteryId);
            }
        });
    }

    const closeModal = () => {
        if (modalOverlay) {
            modalOverlay.style.display = 'none';
        }
    };

    if (closeButton) closeButton.addEventListener('click', closeModal);
    if (modalOverlay) {
        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) closeModal();
        });
    }

    // --- АВТОМАТИЧЕСКОЕ ОБНОВЛЕНИЕ ОЖИДАЮЩИХ ЛОТЕРЕЙ ---

    const waitingCards = new Map();
    let waitingIntervalId = null;
    const collectWaitingCards = () => {
        document.querySelectorAll('.waiting-card').forEach((card) => {
            const lotteryId = card.dataset.lotteryId;
            if (lotteryId) {
                waitingCards.set(lotteryId, card);
            }
        });
    };

    const createCompletedCard = (lotteryId, winner, createdAt) => {
        const item = document.createElement('div');
        item.className = 'gallery-item';
        item.dataset.lotteryId = lotteryId;
        item.dataset.kinopoiskId = winner.kinopoisk_id || '';
        item.dataset.movieName = winner.name || '';
        item.dataset.movieYear = winner.year || '';

        const actionButton = winner.has_magnet
            ? '<button class="action-button download-button" title="Скачать фильм">&#x2913;</button>'
            : '<button class="action-button search-button" title="Искать торрент">&#x1F50D;</button>';

        item.innerHTML = `
            <div class="action-buttons">
                ${actionButton}
                <button class="action-button-delete delete-button" title="Удалить лотерею">&times;</button>
            </div>
            <img src="${winner.poster || 'https://via.placeholder.com/200x300.png?text=No+Image'}" alt="${winner.name}">
            <div class="date-overlay" data-date="${createdAt}"></div>
        `;

        return item;
    };

    const pollWaitingCards = async () => {
        if (!waitingCards.size) {
            if (waitingIntervalId) {
                clearInterval(waitingIntervalId);
                waitingIntervalId = null;
            }
            return;
        }

        const checkCard = async (lotteryId, cardElement) => {
            try {
                const response = await fetch(`/api/result/${lotteryId}`);
                if (!response.ok) return;
                const data = await response.json();
                if (data.result) {
                    const newCard = createCompletedCard(lotteryId, data.result, data.createdAt);
                    cardElement.replaceWith(newCard);
                    waitingCards.delete(lotteryId);
                }
            } catch (error) {
                console.error('Не удалось обновить лотерею', lotteryId, error);
            }
        };

        await Promise.all(Array.from(waitingCards.entries()).map(([lotteryId, card]) => checkCard(lotteryId, card)));

        if (!waitingCards.size && waitingIntervalId) {
            clearInterval(waitingIntervalId);
            waitingIntervalId = null;
        }
    };

    collectWaitingCards();
    if (waitingCards.size) {
        pollWaitingCards();
        waitingIntervalId = setInterval(pollWaitingCards, 5000);
    }

    initializeStoredDownloads();
    ensureWidgetState();
});
