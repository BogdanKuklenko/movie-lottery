// static/js/history.js

document.addEventListener('DOMContentLoaded', () => {
    const gallery = document.querySelector('.history-gallery');
    const modalOverlay = document.getElementById('history-modal');
    const closeButton = modalOverlay ? modalOverlay.querySelector('.close-button') : null;
    const modalWinnerInfo = document.getElementById('modal-winner-info');
    const modalParticipantsContainer = document.getElementById('modal-participants');
    const modalParticipantsList = modalParticipantsContainer ? modalParticipantsContainer.querySelector('.participants-list') : null;

    const widget = document.getElementById('torrent-status-widget');
    const widgetHeader = widget ? widget.querySelector('.widget-header') : null;
    const widgetToggleBtn = widget ? widget.querySelector('#widget-toggle-btn') : null;
    const widgetDownloadsContainer = widget ? widget.querySelector('#widget-downloads') : null;
    const widgetEmptyText = widget ? widget.querySelector('.widget-empty') : null;

    const ACTIVE_DOWNLOADS_KEY = 'lotteryActiveDownloads';
    const placeholderPoster = 'https://via.placeholder.com/200x300.png?text=No+Image';

    const pollIntervals = new Map();
    const activeDownloads = new Map();

    let currentModalLotteryId = null;

    // --- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ---

    const escapeHtml = (value) => {
        if (value === null || value === undefined) {
            return '';
        }
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    };

    const escapeAttr = (value) => {
        if (value === null || value === undefined) {
            return '';
        }
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;');
    };
    
    const getDownloadKey = (lotteryId, kinopoiskId) => {
        if (kinopoiskId) return `kp-${kinopoiskId}`;
        if (lotteryId) return `lottery-${lotteryId}`;
        return null;
    };
    
    const normalizeId = (value) => (value === null || value === undefined ? '' : String(value));
    
    const safeJsonParse = (value) => {
        try {
            return JSON.parse(value);
        } catch (error) {
            return null;
        }
    };

    // --- ЛОГИКА ВИДЖЕТА ЗАГРУЗОК (СОХРАНЕНА ИЗ ОРИГИНАЛА) ---

    const saveActiveDownloads = () => {
        if (!widget) return;
        try {
            const payload = Array.from(activeDownloads.values()).map((entry) => ({
                key: entry.key,
                lotteryId: entry.lotteryId || null,
                movieName: entry.movieName,
                kinopoiskId: entry.kinopoiskId || null,
            }));
            localStorage.setItem(ACTIVE_DOWNLOADS_KEY, JSON.stringify(payload));
        } catch (error) {
            console.warn('Не удалось сохранить активные загрузки:', error);
        }
    };

    const loadStoredDownloads = () => {
        if (!widget) return [];
        try {
            const raw = localStorage.getItem(ACTIVE_DOWNLOADS_KEY);
            if (!raw) return [];
            const parsed = safeJsonParse(raw);
            if (!Array.isArray(parsed)) return [];
            return parsed.map((entry) => ({
                key: entry.key || getDownloadKey(entry.lotteryId, entry.kinopoiskId),
                lotteryId: entry.lotteryId != null ? String(entry.lotteryId) : '',
                movieName: entry.movieName,
                kinopoiskId: entry.kinopoiskId != null ? String(entry.kinopoiskId) : '',
            }));
        } catch (error) {
            console.warn('Не удалось восстановить активные загрузки:', error);
            localStorage.removeItem(ACTIVE_DOWNLOADS_KEY);
            return [];
        }
    };

    const ensureWidgetState = () => {
        if (!widget) return;
        const hasDownloads = activeDownloads.size > 0;
        widget.style.display = hasDownloads ? 'block' : 'none';
        if (widgetEmptyText) {
            widgetEmptyText.style.display = hasDownloads ? 'none' : 'block';
        }
        if (widgetDownloadsContainer) {
            widgetDownloadsContainer.style.display = hasDownloads ? 'block' : 'none';
        }
        if (hasDownloads) {
            widget.classList.remove('minimized');
        }
    };

    const getOrCreateDownloadElement = (lotteryId, kinopoiskId) => {
        if (!widgetDownloadsContainer) return null;
        const key = getDownloadKey(lotteryId, kinopoiskId);
        if (!key) return null;
        let item = widgetDownloadsContainer.querySelector(`[data-download-key="${key}"]`);
        if (!item) {
            item = document.createElement('div');
            item.className = 'widget-download';
            item.dataset.downloadKey = key;
            item.dataset.lotteryId = normalizeId(lotteryId);
            item.dataset.kinopoiskId = normalizeId(kinopoiskId);
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
        const key = getDownloadKey(lotteryId, kinopoiskId);
        if (!widget || !key) return null;
        const existing = activeDownloads.get(key) || {};
        const updated = {
            ...existing,
            key,
            lotteryId: lotteryId != null ? String(lotteryId) : existing.lotteryId || '',
            movieName: movieName || existing.movieName || 'Загрузка...',
            kinopoiskId: kinopoiskId != null ? String(kinopoiskId) : existing.kinopoiskId || '',
        };
        activeDownloads.set(key, updated);

        const element = getOrCreateDownloadElement(updated.lotteryId, updated.kinopoiskId);
        if (element) {
            element.dataset.lotteryId = normalizeId(updated.lotteryId);
            element.dataset.kinopoiskId = normalizeId(updated.kinopoiskId);
            const title = element.querySelector('.widget-download-title');
            if (title) {
                title.textContent = `Загрузка: ${updated.movieName}`;
            }
        }

        ensureWidgetState();
        if (!skipSave) saveActiveDownloads();
        return updated;
    };

    const resolveDownloadKey = (lotteryId, kinopoiskId) => {
        let key = getDownloadKey(lotteryId, kinopoiskId);
        if (key && activeDownloads.has(key)) {
            return key;
        }
        if (lotteryId != null) {
            const searchId = String(lotteryId);
            for (const entry of activeDownloads.values()) {
                if (entry.lotteryId === searchId) {
                    return entry.key;
                }
            }
        }
        return null;
    };
    
    const removeDownload = (lotteryId, kinopoiskId) => {
        const key = resolveDownloadKey(lotteryId, kinopoiskId);
        if (!key) return;
        if (pollIntervals.has(key)) {
            clearInterval(pollIntervals.get(key));
            pollIntervals.delete(key);
        }
        if (activeDownloads.has(key)) {
            activeDownloads.delete(key);
            saveActiveDownloads();
        }
        if (widgetDownloadsContainer) {
            const element = widgetDownloadsContainer.querySelector(`[data-download-key="${key}"]`);
            if (element) {
                element.remove();
            }
        }
        ensureWidgetState();
    };

    const updateDownloadView = (lotteryId, kinopoiskId, data) => {
        if (!widgetDownloadsContainer) return;
        const key = resolveDownloadKey(lotteryId, kinopoiskId);
        if (!key) return;
        const element = widgetDownloadsContainer.querySelector(`[data-download-key="${key}"]`);
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

        const progressValue = Number.parseFloat(data.progress) || 0;
        if (bar) bar.style.width = `${Math.min(100, Math.max(0, progressValue))}%`;
        if (progressText) progressText.textContent = `${progressValue.toFixed(0)}%`;
        const speedValue = typeof data.speed === 'number' ? data.speed.toFixed(2) : data.speed;
        if (speedText) speedText.textContent = speedValue ? `${speedValue} МБ/с` : '0.00 МБ/с';
        if (etaText) etaText.textContent = data.eta || '--:--';
        if (peersText) peersText.textContent = `Сиды: ${data.seeds ?? 0} / Пиры: ${data.peers ?? 0}`;
    };

    const markDownloadCompleted = (lotteryId, kinopoiskId) => {
        if (!widgetDownloadsContainer) return;
        const key = resolveDownloadKey(lotteryId, kinopoiskId);
        if (!key) return;
        const element = widgetDownloadsContainer.querySelector(`[data-download-key="${key}"]`);
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

        setTimeout(() => removeDownload(lotteryId, kinopoiskId), 5000);
    };
    
    const startTorrentStatusPolling = (
        lotteryId,
        movieName,
        kinopoiskId,
        { skipRegister = false, useKinopoiskStatus = false } = {}
    ) => {
        const key = getDownloadKey(lotteryId, kinopoiskId);
        if (!key) return;
        if (!skipRegister) {
            registerDownload(lotteryId, movieName, kinopoiskId);
        }

        if (pollIntervals.has(key)) {
            clearInterval(pollIntervals.get(key));
        }

        const poll = async () => {
            try {
                let data;
                if (useKinopoiskStatus && kinopoiskId) {
                    const response = await fetch(`/api/download-status/${kinopoiskId}`);
                    if (!response.ok) {
                        throw new Error('Сервер вернул ошибку статуса');
                    }
                    data = await response.json();
                } else if (lotteryId) {
                    const response = await fetch(`/api/torrent-status/${lotteryId}`);
                    if (!response.ok) {
                        throw new Error('Сервер вернул ошибку статуса');
                    }
                    data = await response.json();
                } else {
                    return;
                }

                if (data.status === 'error') {
                    updateDownloadView(lotteryId, kinopoiskId, data);
                    if (pollIntervals.has(key)) {
                        clearInterval(pollIntervals.get(key));
                        pollIntervals.delete(key);
                    }
                    return;
                }

                if (data.status === 'not_found' && useKinopoiskStatus) {
                    removeDownload(lotteryId, kinopoiskId);
                    if (pollIntervals.has(key)) {
                        clearInterval(pollIntervals.get(key));
                        pollIntervals.delete(key);
                    }
                    return;
                }

                updateDownloadView(lotteryId, kinopoiskId, data);

                const progressValue = Number.parseFloat(data.progress) || 0;
                const statusText = (data.status || '').toLowerCase();
                const isCompleted = progressValue >= 100 || statusText.includes('seeding') || statusText.includes('completed');

                if (isCompleted) {
                    if (pollIntervals.has(key)) {
                        clearInterval(pollIntervals.get(key));
                        pollIntervals.delete(key);
                    }
                    markDownloadCompleted(lotteryId, kinopoiskId);
                }
            } catch (error) {
                console.error('Ошибка при опросе статуса торрента:', error);
                updateDownloadView(lotteryId, kinopoiskId, { status: 'error', message: 'Нет связи с qBittorrent' });
                if (pollIntervals.has(key)) {
                    clearInterval(pollIntervals.get(key));
                    pollIntervals.delete(key);
                }
            }
        };

        poll();
        const intervalId = setInterval(poll, 3000);
        pollIntervals.set(key, intervalId);
    };

    const initializeStoredDownloads = () => {
        if (!widget) return;
        const stored = loadStoredDownloads();
        stored.forEach((entry) => {
            if (!entry || !entry.lotteryId) return;
            startTorrentStatusPolling(entry.lotteryId, entry.movieName, entry.kinopoiskId, {
                skipRegister: false,
                useKinopoiskStatus: Boolean(entry.kinopoiskId),
            });
        });
    };

    const syncExternalDownloads = async () => {
        if (!gallery || !widget) return;
        try {
            const response = await fetch('/api/active-downloads');
            if (!response.ok) return;
            const payload = await response.json();
            const downloads = Array.isArray(payload.downloads) ? payload.downloads : [];
            downloads.forEach((item) => {
                const kinopoiskId = item.kinopoisk_id != null ? String(item.kinopoisk_id) : '';
                if (!kinopoiskId) return;
                const card = gallery.querySelector(`.gallery-item[data-kinopoisk-id="${kinopoiskId}"]`);
                if (!card) return;
                const lotteryId = card.dataset.lotteryId;
                const movieName = card.dataset.movieName || item.name;
                registerDownload(lotteryId, movieName, kinopoiskId, { skipSave: false });
                updateDownloadView(lotteryId, kinopoiskId, item);
                startTorrentStatusPolling(lotteryId, movieName, kinopoiskId, {
                    skipRegister: true,
                    useKinopoiskStatus: true,
                });
            });
        } catch (error) {
            console.warn('Не удалось синхронизировать активные загрузки:', error);
        }
    };

    // --- ЛОГИКА ОЖИДАЮЩИХ КАРТОЧЕК ---

    const waitingCards = new Map();
    
    const collectWaitingCards = () => {
        waitingCards.clear();
        gallery.querySelectorAll('.waiting-card').forEach(card => {
            const lotteryId = card.dataset.lotteryId;
            if (lotteryId) waitingCards.set(lotteryId, card);
        });
    };

    const createCompletedCard = (lottery, winner) => {
        const item = document.createElement('div');
        item.className = 'gallery-item';
        // Копируем все data-атрибуты из ответа сервера
        item.dataset.lotteryId = lottery.id;
        item.dataset.kinopoiskId = winner.kinopoisk_id || '';
        item.dataset.movieName = winner.name || '';
        item.dataset.movieYear = winner.year || '';
        item.dataset.moviePoster = winner.poster || '';
        item.dataset.movieDescription = winner.description || '';
        item.dataset.movieRating = winner.rating_kp != null ? winner.rating_kp : '';
        item.dataset.movieGenres = winner.genres || '';
        item.dataset.movieCountries = winner.countries || '';
        item.dataset.hasMagnet = winner.has_magnet ? 'true' : 'false';
        item.dataset.magnetLink = winner.magnet_link || '';

        item.innerHTML = `
            <div class="action-buttons">
                <button type="button" class="icon-button download-button" title="Скачать фильм" aria-label="Скачать фильм" ${!winner.has_magnet ? 'hidden' : ''}>
                     <svg class="icon-svg icon-download" viewBox="0 0 24 24"><use href="#icon-download"></use></svg>
                </button>
                <button type="button" class="icon-button search-button" title="Искать торрент" aria-label="Искать торрент" ${winner.has_magnet ? 'hidden' : ''}>
                     <svg class="icon-svg icon-search" viewBox="0 0 24 24"><use href="#icon-search"></use></svg>
                </button>
                <button type="button" class="icon-button delete-button" title="Удалить лотерею" aria-label="Удалить лотерею">
                     <svg class="icon-svg icon-delete" viewBox="0 0 24 24"><use href="#icon-delete"></use></svg>
                </button>
            </div>
            <div class="date-badge" data-date="${escapeAttr(lottery.createdAt)}"></div>
            <img src="${escapeAttr(winner.poster || placeholderPoster)}" alt="${escapeHtml(winner.name)}">
        `;
        return item;
    };

    const pollWaitingCards = async () => {
        if (!waitingCards.size) return;

        for (const [lotteryId, cardElement] of waitingCards.entries()) {
            try {
                const data = await fetchLotteryDetails(lotteryId);
                if (data.result) {
                    const newCard = createCompletedCard({ id: lotteryId, createdAt: data.createdAt }, data.result);
                    cardElement.replaceWith(newCard);
                    waitingCards.delete(lotteryId);
                    formatDateBadges(); // Обновляем дату на новой карточке
                }
            } catch (error) {
                console.error(`Не удалось обновить лотерею ${lotteryId}:`, error);
                waitingCards.delete(lotteryId); // Прекращаем попытки для этой карточки
            }
        }
    };


    // --- НОВАЯ ЛОГИКА ДЛЯ МОДАЛЬНОГО ОКНА ---

    const handleDownloadClick = async (kinopoiskId, movieName, lotteryId) => {
        if (!kinopoiskId) {
            showToast('Сначала добавьте magnet-ссылку для этого фильма.', 'warning');
            openModal(lotteryId);
            return;
        }
        registerDownload(lotteryId, movieName, kinopoiskId);
        try {
            const response = await fetch(`/api/start-download/${kinopoiskId}`, { method: 'POST' });
            const data = await response.json();
            if (data.success) {
                startTorrentStatusPolling(lotteryId, movieName, kinopoiskId, { skipRegister: true });
                showToast('Загрузка началась.', 'success');
            } else {
                showToast(`Ошибка: ${data.message}`, 'error');
                removeDownload(lotteryId, kinopoiskId);
            }
        } catch (error) {
            console.error('Ошибка при запуске скачивания:', error);
            showToast('Произошла критическая ошибка.', 'error');
            removeDownload(lotteryId, kinopoiskId);
        }
    };
    
    const handleDeleteLottery = async (lotteryId, cardElement) => {
        try {
            const response = await fetch(`/delete-lottery/${lotteryId}`, { method: 'POST' });
            const data = await response.json();
            
            showToast(data.message, data.success ? 'success' : 'error');

            if (data.success) {
                closeModal();
                cardElement.classList.add('is-deleting');
                removeDownload(lotteryId, cardElement.dataset.kinopoiskId);
                cardElement.addEventListener('transitionend', () => cardElement.remove());
            }
        } catch (error) {
            showToast('Произошла критическая ошибка при удалении.', 'error');
        }
    };
    
    const handleSaveMagnet = async (lotteryId, kinopoiskId, magnetLink) => {
        if (!kinopoiskId) {
            showToast('Не удалось определить ID фильма для сохранения.', 'error');
            return;
        }
        try {
            const response = await fetch('/api/movie-magnet', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ kinopoisk_id: kinopoiskId, magnet_link: magnetLink }),
            });
            const data = await response.json();
            showToast(data.message, data.success ? 'success' : 'error');
            
            if (data.success) {
                // Обновляем и модальное окно, и карточку в галерее
                const refreshedData = await fetchLotteryDetails(lotteryId);
                renderLotteryDetails(refreshedData);
                
                const card = gallery.querySelector(`.gallery-item[data-lottery-id="${lotteryId}"]`);
                if (card) {
                    card.dataset.hasMagnet = data.has_magnet ? 'true' : 'false';
                    card.dataset.magnetLink = data.magnet_link || '';
                    const downloadBtn = card.querySelector('.download-button');
                    const searchBtn = card.querySelector('.search-button');
                    if (downloadBtn) downloadBtn.hidden = !data.has_magnet;
                    if (searchBtn) searchBtn.hidden = data.has_magnet;
                }
            }
        } catch (error) {
            showToast('Произошла критическая ошибка при сохранении ссылки.', 'error');
        }
    };
    
    const addMovieToLibrary = async (moviePayload) => {
        if (!moviePayload) return;
        try {
            const response = await fetch('/api/library', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ movie: moviePayload }),
            });
            const data = await response.json();
            showToast(data.message, data.success ? 'success' : 'error');
        } catch (error) {
            showToast(error.message, 'error');
        }
    };
    
    const renderParticipantsList = (movies, winnerName) => {
        if (!modalParticipantsContainer || !modalParticipantsList) return;
        if (!movies || !movies.length) {
            modalParticipantsContainer.style.display = 'none';
            return;
        }

        modalParticipantsList.innerHTML = '';
        movies.forEach((movie) => {
            const isWinner = movie.name === winnerName;
            const li = document.createElement('li');
            li.className = `participant-item ${isWinner ? 'winner' : ''}`;
            li.innerHTML = `
                <img class="participant-poster" src="${escapeAttr(movie.poster || placeholderPoster)}" alt="${escapeAttr(movie.name)}">
                <span class="participant-name">${escapeHtml(movie.name)}</span>
                <span class="participant-meta">${escapeHtml(movie.year || '')}</span>
                ${isWinner ? '<span class="participant-winner-badge">Победитель</span>' : ''}
            `;
            modalParticipantsList.appendChild(li);
        });
        modalParticipantsContainer.style.display = 'block';
    };

    const renderWinnerCard = (winner) => {
        if (!modalWinnerInfo) return;

        const ratingValue = parseFloat(winner.rating_kp);
        let ratingBadgeHtml = '';
        if (!isNaN(ratingValue)) {
            const ratingClass = ratingValue >= 7 ? 'rating-high' : ratingValue >= 5 ? 'rating-medium' : 'rating-low';
            ratingBadgeHtml = `<div class="rating-badge ${ratingClass}">${ratingValue.toFixed(1)}</div>`;
        }

        modalWinnerInfo.innerHTML = `
            <div class="winner-card">
                <div class="winner-poster">
                    <img src="${escapeAttr(winner.poster || placeholderPoster)}" alt="Постер ${escapeAttr(winner.name)}">
                    ${ratingBadgeHtml}
                </div>
                <div class="winner-details">
                    <h2>${escapeHtml(winner.name)}${winner.year ? ` (${escapeHtml(winner.year)})` : ''}</h2>
                    <p class="meta-info">${escapeHtml(winner.genres || 'н/д')} / ${escapeHtml(winner.countries || 'н/д')}</p>
                    <p class="description">${escapeHtml(winner.description || 'Описание отсутствует.')}</p>
                    <div class="magnet-form">
                        <label for="magnet-input">Magnet-ссылка:</label>
                        <input type="text" id="magnet-input" value="${escapeAttr(winner.magnet_link || '')}" placeholder="Вставьте magnet-ссылку и нажмите Сохранить...">
                        <div class="magnet-actions">
                            <button class="action-button save-magnet-btn">Сохранить</button>
                            ${winner.has_magnet ? '<button class="action-button-delete delete-magnet-btn">Удалить ссылку</button>' : ''}
                        </div>
                    </div>
                    <button class="secondary-button add-library-modal-btn">Добавить в библиотеку</button>
                </div>
            </div>`;
    };

    const renderLotteryDetails = (data) => {
        if (data.result) {
            renderWinnerCard(data.result);
            renderParticipantsList(data.movies, data.result.name);

            // Навешиваем обработчики на кнопки внутри модального окна
            const saveBtn = modalWinnerInfo.querySelector('.save-magnet-btn');
            if (saveBtn) {
                saveBtn.addEventListener('click', () => {
                    const input = modalWinnerInfo.querySelector('#magnet-input');
                    handleSaveMagnet(currentModalLotteryId, data.result.kinopoisk_id, input.value.trim());
                });
            }

            const deleteBtn = modalWinnerInfo.querySelector('.delete-magnet-btn');
            if (deleteBtn) {
                deleteBtn.addEventListener('click', () => {
                    handleSaveMagnet(currentModalLotteryId, data.result.kinopoisk_id, '');
                });
            }

            const addToLibraryBtn = modalWinnerInfo.querySelector('.add-library-modal-btn');
            if (addToLibraryBtn) {
                addToLibraryBtn.addEventListener('click', () => addMovieToLibrary(data.result));
            }
        } else {
            // Если результата еще нет (для карточек в ожидании)
            modalWinnerInfo.innerHTML = '<h3>Эта лотерея еще не завершена.</h3>';
            renderParticipantsList(data.movies, null);
        }
    };
    
    const fetchLotteryDetails = async (lotteryId) => {
        const response = await fetch(`/api/result/${lotteryId}`);
        if (!response.ok) throw new Error('Ошибка сети');
        const data = await response.json();
        if (data.error) throw new Error(data.error);
        return data;
    };
    
    const openModal = async (lotteryId) => {
        if (!modalOverlay || !modalWinnerInfo) return;
        currentModalLotteryId = lotteryId;
        modalOverlay.style.display = 'flex';
        document.body.classList.add('no-scroll');
        modalWinnerInfo.innerHTML = '<div class="loader"></div>';
        if (modalParticipantsContainer) modalParticipantsContainer.style.display = 'none';

        try {
            const data = await fetchLotteryDetails(lotteryId);
            renderLotteryDetails(data);
        } catch (error) {
            modalWinnerInfo.innerHTML = `<p class="error-message">Не удалось загрузить детали: ${escapeHtml(error.message)}</p>`;
        }
    };

    const closeModal = () => {
        if (modalOverlay) modalOverlay.style.display = 'none';
        document.body.classList.remove('no-scroll');
    };
    
    // --- ОБЩИЕ ФУНКЦИИ И ИНИЦИАЛИЗАЦИЯ ---

    const formatDateBadges = () => {
        if (!gallery) return;
        const formatter = new Intl.DateTimeFormat('ru-RU', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
        });

        gallery.querySelectorAll('.date-badge').forEach((badge) => {
            const iso = badge.dataset.date;
            if (!iso) return;
            const date = new Date(iso);
            if (isNaN(date.getTime())) return;
            badge.textContent = formatter.format(date);
        });
    };
    
    const initializeCardStates = () => {
        if (!gallery) return;
        gallery.querySelectorAll('.gallery-item:not(.waiting-card)').forEach((card) => {
            const hasMagnet = card.dataset.hasMagnet === 'true';
            const downloadBtn = card.querySelector('.download-button');
            const searchBtn = card.querySelector('.search-button');
            if(downloadBtn) downloadBtn.hidden = !hasMagnet;
            if(searchBtn) searchBtn.hidden = hasMagnet;
        });
    };
    
    // --- ГЛАВНЫЙ ОБРАБОТЧИК КЛИКОВ НА ГАЛЕРЕЕ ---
    if (gallery) {
        gallery.addEventListener('click', (event) => {
            const card = event.target.closest('.gallery-item');
            if (!card) return;

            const { lotteryId, kinopoiskId, movieName, movieYear, hasMagnet } = card.dataset;
            const button = event.target.closest('.icon-button');

            if (button) { // Клик был по кнопке
                event.stopPropagation();

                if (button.classList.contains('delete-button')) {
                    handleDeleteLottery(lotteryId, card);
                } else if (button.classList.contains('search-button')) {
                    handleSearchClick(movieName, movieYear);
                } else if (button.classList.contains('download-button')) {
                    if (hasMagnet === 'true') {
                       handleDownloadClick(kinopoiskId, movieName, lotteryId);
                    } else {
                       showToast('Сначала добавьте magnet-ссылку в деталях лотереи.', 'warning');
                       openModal(lotteryId);
                    }
                }
            } else { // Клик по самой карточке
                openModal(lotteryId);
            }
        });
    }

    if (closeButton) closeButton.addEventListener('click', closeModal);
    if (modalOverlay) {
        modalOverlay.addEventListener('click', (event) => {
            if (event.target === modalOverlay) closeModal();
        });
    }

    if (widgetHeader) {
        widgetHeader.addEventListener('click', () => widget.classList.toggle('minimized'));
    }
    if (widgetToggleBtn) {
        widgetToggleBtn.addEventListener('click', (event) => {
            event.stopPropagation();
            widget.classList.toggle('minimized');
        });
    }
    
    // --- ЗАПУСК ВСЕГО ПРИ ЗАГРУЗКЕ СТРАНИЦЫ ---
    
    formatDateBadges();
    initializeCardStates();
    
    // Логика для карточек в ожидании
    collectWaitingCards();
    if (waitingCards.size > 0) {
        const poller = () => pollWaitingCards();
        poller(); // Запускаем сразу
        const pollIntervalId = setInterval(() => {
            if (waitingCards.size === 0) {
                clearInterval(pollIntervalId);
            } else {
                poller();
            }
        }, 5000);
    }
    
    // Логика виджета
    initializeStoredDownloads();
    ensureWidgetState();
    syncExternalDownloads();
    if (widget) {
        setInterval(syncExternalDownloads, 5000);
        window.addEventListener('focus', syncExternalDownloads);
    }
});