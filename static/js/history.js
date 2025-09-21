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
    const waitingCards = new Map();
    let currentModalLotteryId = null;

    // --- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ---

    const escapeHtml = (value) => {
        if (value === null || value === undefined) return '';
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    };

    const escapeAttr = (value) => {
        if (value === null || value === undefined) return '';
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

    // --- ЛОГИКА ВИДЖЕТА ЗАГРУЗОК ---

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
        if (widgetEmptyText) widgetEmptyText.style.display = hasDownloads ? 'none' : 'block';
        if (widgetDownloadsContainer) widgetDownloadsContainer.style.display = hasDownloads ? 'block' : 'none';
        if (hasDownloads) widget.classList.remove('minimized');
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
                <div class="progress-bar-container"><div class="progress-bar"></div></div>
                <div class="widget-stats">
                    <span class="progress-text">0%</span>
                    <span class="speed-text">0.00 МБ/с</span>
                    <span class="eta-text">--:--</span>
                </div>
                <div class="widget-stats-bottom"><span class="peers-text">Сиды: 0 / Пиры: 0</span></div>`;
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
            const title = element.querySelector('.widget-download-title');
            if (title) title.textContent = `Загрузка: ${updated.movieName}`;
        }
        ensureWidgetState();
        if (!skipSave) saveActiveDownloads();
        return updated;
    };

    const resolveDownloadKey = (lotteryId, kinopoiskId) => {
        let key = getDownloadKey(lotteryId, kinopoiskId);
        if (key && activeDownloads.has(key)) return key;
        if (lotteryId != null) {
            const searchId = String(lotteryId);
            for (const entry of activeDownloads.values()) {
                if (entry.lotteryId === searchId) return entry.key;
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
        const element = widgetDownloadsContainer ? widgetDownloadsContainer.querySelector(`[data-download-key="${key}"]`) : null;
        if (element) element.remove();
        ensureWidgetState();
    };

    const updateDownloadView = (lotteryId, kinopoiskId, data) => {
        const key = resolveDownloadKey(lotteryId, kinopoiskId);
        if (!key || !widgetDownloadsContainer) return;
        const element = widgetDownloadsContainer.querySelector(`[data-download-key="${key}"]`);
        if (!element) return;

        const title = element.querySelector('.widget-download-title');
        const bar = element.querySelector('.progress-bar');
        const progressText = element.querySelector('.progress-text');
        const speedText = element.querySelector('.speed-text');
        const etaText = element.querySelector('.eta-text');
        const peersText = element.querySelector('.peers-text');

        if (data.name && title) title.textContent = `Загрузка: ${data.name}`;
        if (data.status === 'error' || data.status === 'not_found') {
            if (progressText) progressText.textContent = data.status === 'error' ? 'Ошибка' : 'Ожидание...';
            if (speedText) speedText.textContent = '-';
            if (etaText) etaText.textContent = '-';
            if (peersText) peersText.textContent = data.message || (data.status === 'not_found' ? 'Торрент не найден' : '');
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
        const key = resolveDownloadKey(lotteryId, kinopoiskId);
        if (!key || !widgetDownloadsContainer) return;
        const element = widgetDownloadsContainer.querySelector(`[data-download-key="${key}"]`);
        if (!element) return;
        const speedText = element.querySelector('.speed-text');
        if (speedText) speedText.textContent = 'Готово';
        setTimeout(() => removeDownload(lotteryId, kinopoiskId), 5000);
    };

    const startTorrentStatusPolling = (lotteryId, movieName, kinopoiskId, { skipRegister = false, useKinopoiskStatus = false } = {}) => {
        const key = getDownloadKey(lotteryId, kinopoiskId);
        if (!key) return;
        if (!skipRegister) registerDownload(lotteryId, movieName, kinopoiskId);
        if (pollIntervals.has(key)) clearInterval(pollIntervals.get(key));

        const poll = async () => {
            try {
                let response, data;
                if (useKinopoiskStatus && kinopoiskId) {
                    response = await fetch(`/api/download-status/${kinopoiskId}`);
                } else if (lotteryId) {
                    response = await fetch(`/api/torrent-status/${lotteryId}`);
                } else {
                    return;
                }
                if (!response.ok) throw new Error('Сервер вернул ошибку статуса');
                data = await response.json();

                if (data.status === 'error' || (data.status === 'not_found' && useKinopoiskStatus)) {
                    updateDownloadView(lotteryId, kinopoiskId, data);
                    clearInterval(pollIntervals.get(key));
                    pollIntervals.delete(key);
                    if (data.status === 'not_found') removeDownload(lotteryId, kinopoiskId);
                    return;
                }

                updateDownloadView(lotteryId, kinopoiskId, data);
                const progressValue = Number.parseFloat(data.progress) || 0;
                const statusText = (data.status || '').toLowerCase();
                if (progressValue >= 100 || statusText.includes('seeding') || statusText.includes('completed')) {
                    clearInterval(pollIntervals.get(key));
                    pollIntervals.delete(key);
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
        pollIntervals.set(key, setInterval(poll, 3000));
    };

    const initializeStoredDownloads = () => {
        if (!widget) return;
        loadStoredDownloads().forEach(entry => {
            if (entry && entry.lotteryId) {
                startTorrentStatusPolling(entry.lotteryId, entry.movieName, entry.kinopoiskId, { useKinopoiskStatus: !!entry.kinopoiskId });
            }
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
                const kinopoiskId = item.kinopoisk_id ? String(item.kinopoisk_id) : '';
                if (!kinopoiskId) return;
                const card = gallery.querySelector(`.gallery-item[data-kinopoisk-id="${kinopoiskId}"]`);
                if (!card) return;
                const lotteryId = card.dataset.lotteryId;
                const movieName = card.dataset.movieName || item.name;
                registerDownload(lotteryId, movieName, kinopoiskId);
                updateDownloadView(lotteryId, kinopoiskId, item);
                startTorrentStatusPolling(lotteryId, movieName, kinopoiskId, { skipRegister: true, useKinopoiskStatus: true });
            });
        } catch (error) {
            console.warn('Не удалось синхронизировать активные загрузки:', error);
        }
    };


    // --- ЛОГИКА ОЖИДАЮЩИХ КАРТОЧЕК ---

    const collectWaitingCards = () => {
        waitingCards.clear();
        gallery.querySelectorAll('.waiting-card').forEach(card => {
            if (card.dataset.lotteryId) waitingCards.set(card.dataset.lotteryId, card);
        });
    };
    
    const createCompletedCard = (lotteryId, winner, createdAtIso) => {
        const item = document.createElement('div');
        item.className = 'gallery-item';
        item.dataset.lotteryId = lotteryId;
        item.dataset.kinopoiskId = winner.kinopoisk_id || '';
        item.dataset.movieName = winner.name || '';
        item.dataset.movieYear = winner.year || '';
        item.dataset.moviePoster = winner.poster || '';
        item.dataset.movieDescription = winner.description || '';
        item.dataset.movieRating = winner.rating_kp != null ? winner.rating_kp.toFixed(1) : '';
        item.dataset.movieGenres = winner.genres || '';
        item.dataset.movieCountries = winner.countries || '';
        item.dataset.hasMagnet = winner.has_magnet ? 'true' : 'false';
        item.dataset.magnetLink = winner.magnet_link || '';

        item.innerHTML = `
            <div class="action-buttons">
                <button type="button" class="icon-button download-button"><svg class="icon-svg icon-download" viewBox="0 0 24 24"><use href="#icon-download"></use></svg></button>
                <button type="button" class="icon-button search-button"><svg class="icon-svg icon-search" viewBox="0 0 24 24"><use href="#icon-search"></use></svg></button>
                <button type="button" class="icon-button delete-button"><svg class="icon-svg icon-delete" viewBox="0 0 24 24"><use href="#icon-delete"></use></svg></button>
            </div>
            <div class="date-badge" data-date="${escapeAttr(createdAtIso)}"></div>
            <img src="${escapeAttr(winner.poster || placeholderPoster)}" alt="${escapeHtml(winner.name)}">`;
        
        const downloadBtn = item.querySelector('.download-button');
        const searchBtn = item.querySelector('.search-button');
        downloadBtn.style.display = winner.has_magnet ? 'inline-flex' : 'none';
        searchBtn.style.display = winner.has_magnet ? 'none' : 'inline-flex';
        return item;
    };

    const pollWaitingCards = async () => {
        if (!waitingCards.size) return;
        for (const [lotteryId, cardElement] of waitingCards.entries()) {
            try {
                const data = await fetchLotteryDetails(lotteryId);
                if (data.result) {
                    const newCard = createCompletedCard(lotteryId, data.result, data.createdAt);
                    cardElement.replaceWith(newCard);
                    waitingCards.delete(lotteryId);
                    formatDateBadges();
                }
            } catch (error) {
                console.error(`Не удалось обновить лотерею ${lotteryId}:`, error);
                waitingCards.delete(lotteryId);
            }
        }
    };


    // --- ЛОГИКА МОДАЛЬНОГО ОКНА И ДЕЙСТВИЙ ---

    const fetchLotteryDetails = async (lotteryId) => {
        const response = await fetch(`/api/result/${lotteryId}`);
        if (!response.ok) throw new Error('Ошибка сети');
        const data = await response.json();
        if(data.error) throw new Error(data.error);
        return data;
    };

    const handleSearchClick = (movieName, movieYear) => {
        if (!movieName) return;
        const query = encodeURIComponent(`${movieName.trim()} ${movieYear || ''}`.trim());
        window.open(`https://rutracker.org/forum/tracker.php?nm=${query}`, '_blank');
    };
    
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

    const addMovieToLibrary = async (movieData) => {
        try {
            const response = await fetch('/api/library', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ movie: movieData }),
            });
            const data = await response.json();
            showToast(data.message, data.success ? 'success' : 'error');
        } catch (error) {
            showToast(error.message, 'error');
        }
    };
    
    const handleSaveMagnet = async (lotteryId, kinopoiskId, magnetLink) => {
        if (!kinopoiskId) return showToast('Для фильма не указан kinopoisk_id.', 'error');
        try {
            const response = await fetch('/api/movie-magnet', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ kinopoisk_id: kinopoiskId, magnet_link: magnetLink }),
            });
            const data = await response.json();
            showToast(data.message, data.success ? 'success' : 'error');
            if (data.success) {
                const refreshed = await fetchLotteryDetails(lotteryId);
                renderLotteryDetails(refreshed);
                const card = gallery.querySelector(`.gallery-item[data-lottery-id="${lotteryId}"]`);
                if (card) {
                    card.dataset.hasMagnet = data.has_magnet ? 'true' : 'false';
                    card.dataset.magnetLink = data.magnet_link || '';
                    initializeCardStates();
                }
            }
        } catch (error) {
            showToast('Критическая ошибка при сохранении ссылки.', 'error');
        }
    };
    
    const renderParticipantsList = (movies, winnerName) => {
        if (!modalParticipantsContainer || !modalParticipantsList) return;
        if (!movies || !movies.length) return modalParticipantsContainer.style.display = 'none';
        modalParticipantsList.innerHTML = movies.map(movie => {
            const isWinner = movie.name === winnerName;
            return `<li class="participant-item ${isWinner ? 'winner' : ''}">
                <img class="participant-poster" src="${escapeAttr(movie.poster || placeholderPoster)}" alt="${escapeAttr(movie.name)}">
                <span class="participant-name">${escapeHtml(movie.name)}</span>
                <span class="participant-meta">${escapeHtml(movie.year || '')}</span>
                ${isWinner ? '<span class="participant-winner-badge">Победитель</span>' : ''}
            </li>`;
        }).join('');
        modalParticipantsContainer.style.display = 'block';
    };

    const renderWinnerCard = (winner) => {
        if (!modalWinnerInfo) return;
        const ratingValue = parseFloat(winner.rating_kp);
        const ratingBadgeHtml = !isNaN(ratingValue) ? `<div class="rating-badge rating-${ratingValue >= 7 ? 'high' : ratingValue >= 5 ? 'medium' : 'low'}">${ratingValue.toFixed(1)}</div>` : '';
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
                        <input type="text" id="magnet-input" value="${escapeAttr(winner.magnet_link || '')}" placeholder="Вставьте magnet-ссылку...">
                        <div class="magnet-actions">
                            <button class="action-button save-magnet-btn">Сохранить</button>
                            ${winner.has_magnet ? '<button class="action-button-delete delete-magnet-btn">Удалить</button>' : ''}
                        </div>
                    </div>
                    <button class="secondary-button add-library-modal-btn">Добавить в библиотеку</button>
                    
                    <div class="slide-to-delete-container ${winner.is_on_client ? '' : 'disabled'}" data-torrent-hash="${escapeAttr(winner.torrent_hash || '')}">
                        <div class="slide-to-delete-track">
                            <div class="slide-to-delete-fill"></div>
                            <span class="slide-to-delete-text">Удалить с клиента</span>
                            <div class="slide-to-delete-thumb">&gt;</div>
                        </div>
                    </div>
                </div>
            </div>`;
    };

    const renderLotteryDetails = (data) => {
        renderParticipantsList(data.movies, data.result ? data.result.name : null);
        if (data.result) {
            renderWinnerCard(data.result);
            modalWinnerInfo.querySelector('.save-magnet-btn').addEventListener('click', () => {
                const input = modalWinnerInfo.querySelector('#magnet-input');
                handleSaveMagnet(currentModalLotteryId, data.result.kinopoisk_id, input.value.trim());
            });
            const deleteMagnetBtn = modalWinnerInfo.querySelector('.delete-magnet-btn');
            if (deleteMagnetBtn) {
                deleteMagnetBtn.addEventListener('click', () => handleSaveMagnet(currentModalLotteryId, data.result.kinopoisk_id, ''));
            }
            modalWinnerInfo.querySelector('.add-library-modal-btn').addEventListener('click', () => addMovieToLibrary(data.result));
            
            const slider = modalWinnerInfo.querySelector('.slide-to-delete-container');
            if (slider && !slider.classList.contains('disabled')) {
                initSlider(slider);
            }
        }
    };
    
    const handleDeleteLottery = async (lotteryId, cardElement) => {
        try {
            const response = await fetch(`/delete-lottery/${lotteryId}`, { method: 'POST' });
            const data = await response.json();
            showToast(data.message, data.success ? 'success' : 'error');
            if (data.success) {
                cardElement.classList.add('is-deleting');
                removeDownload(lotteryId, cardElement.dataset.kinopoiskId);
                cardElement.addEventListener('transitionend', () => cardElement.remove());
            }
        } catch (error) {
            showToast('Критическая ошибка при удалении.', 'error');
        }
    };

    const openModal = async (lotteryId) => {
        if (!modalOverlay) return;
        currentModalLotteryId = lotteryId;
        modalOverlay.style.display = 'flex';
        document.body.classList.add('no-scroll');
        modalWinnerInfo.innerHTML = '<div class="loader"></div>';
        if (modalParticipantsContainer) modalParticipantsContainer.style.display = 'none';

        try {
            const data = await fetchLotteryDetails(lotteryId);
            renderLotteryDetails(data);
        } catch (error) {
            modalWinnerInfo.innerHTML = `<p class="error-message">${escapeHtml(error.message)}</p>`;
        }
    };

    const closeModal = () => {
        if (modalOverlay) modalOverlay.style.display = 'none';
        document.body.classList.remove('no-scroll');
    };
    
    // --- НОВАЯ ЛОГИКА ДЛЯ СЛАЙДЕРА ---
    
    const handleDeleteTorrent = async (torrentHash, sliderContainer) => {
        try {
            const response = await fetch(`/api/delete-torrent/${torrentHash}`, { method: 'POST' });
            const data = await response.json();
            showToast(data.message, data.success ? 'success' : 'error');
            if (data.success) {
                sliderContainer.classList.add('disabled');
                const card = gallery.querySelector(`.gallery-item[data-torrent-hash="${torrentHash}"]`);
                if (card) {
                    card.classList.remove('has-torrent-on-client');
                    card.dataset.isOnClient = 'false';
                }
            }
        } catch(e) {
            showToast('Критическая ошибка при удалении торрента.', 'error');
        }
    };

    const initSlider = (sliderContainer) => {
        const thumb = sliderContainer.querySelector('.slide-to-delete-thumb');
        const track = sliderContainer.querySelector('.slide-to-delete-track');
        const fill = sliderContainer.querySelector('.slide-to-delete-fill');
        if (!thumb || !track || !fill) return;

        let isDragging = false;
        let startX = 0;
        let maxDrag = track.offsetWidth - thumb.offsetWidth - 4; // 4px for padding/borders

        const onMouseMove = (e) => {
            if (!isDragging) return;
            const currentX = e.clientX || e.touches[0].clientX;
            let moveX = currentX - startX;
            moveX = Math.max(0, Math.min(moveX, maxDrag));

            thumb.style.transform = `translateX(${moveX}px)`;
            fill.style.width = `${moveX + (thumb.offsetWidth / 2)}px`;
        };

        const onMouseUp = (e) => {
            if (!isDragging) return;
            isDragging = false;
            
            const currentX = e.clientX || e.changedTouches[0].clientX;
            let moveX = currentX - startX;

            if (moveX > maxDrag * 0.9) {
                // Успешно
                handleDeleteTorrent(sliderContainer.dataset.torrentHash, sliderContainer);
            } else {
                // Возврат в начало
                thumb.style.transition = 'transform 0.3s ease';
                fill.style.transition = 'width 0.3s ease';
                thumb.style.transform = 'translateX(0px)';
                fill.style.width = '0px';
                setTimeout(() => {
                    thumb.style.transition = '';
                    fill.style.transition = '';
                }, 300);
            }

            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            document.removeEventListener('touchmove', onMouseMove);
            document.removeEventListener('touchend', onMouseUp);
        };

        const onMouseDown = (e) => {
            isDragging = true;
            startX = e.clientX || e.touches[0].clientX;
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
            document.addEventListener('touchmove', onMouseMove);
            document.addEventListener('touchend', onMouseUp);
        };
        
        thumb.addEventListener('mousedown', onMouseDown);
        thumb.addEventListener('touchstart', onMouseDown);
    };


    // --- ОБЩИЕ ФУНКЦИИ И ИНИЦИАЛИЗАЦИЯ ---

    const formatDateBadges = () => {
        const formatter = new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
        gallery.querySelectorAll('.date-badge').forEach(badge => {
            const date = new Date(badge.dataset.date);
            if (!isNaN(date)) badge.textContent = formatter.format(date);
        });
    };

    const initializeCardStates = () => {
        if (!gallery) return;
        gallery.querySelectorAll('.gallery-item:not(.waiting-card)').forEach(card => {
            const hasMagnet = card.dataset.hasMagnet === 'true';
            const downloadBtn = card.querySelector('.download-button');
            const searchBtn = card.querySelector('.search-button');
            if (downloadBtn) downloadBtn.style.display = hasMagnet ? 'inline-flex' : 'none';
            if (searchBtn) searchBtn.style.display = hasMagnet ? 'none' : 'inline-flex';
        });
    };

    // --- ГЛАВНЫЙ ОБРАБОТЧИК КЛИКОВ ---
    if (gallery) {
        gallery.addEventListener('click', (event) => {
            const card = event.target.closest('.gallery-item');
            if (!card) return;
            const { lotteryId, kinopoiskId, movieName, movieYear } = card.dataset;
            const button = event.target.closest('.icon-button');

            if (button) {
                event.stopPropagation();
                if (button.classList.contains('delete-button')) handleDeleteLottery(lotteryId, card);
                else if (button.classList.contains('search-button')) handleSearchClick(movieName, movieYear);
                else if (button.classList.contains('download-button')) handleDownloadClick(kinopoiskId, movieName, lotteryId);
            } else {
                openModal(lotteryId);
            }
        });
    }

    if (closeButton) closeButton.addEventListener('click', closeModal);
    if (modalOverlay) modalOverlay.addEventListener('click', e => { if (e.target === modalOverlay) closeModal(); });

    if (widgetHeader) widgetHeader.addEventListener('click', () => widget.classList.toggle('minimized'));
    if (widgetToggleBtn) widgetToggleBtn.addEventListener('click', e => { e.stopPropagation(); widget.classList.toggle('minimized'); });

    // --- ЗАПУСК ВСЕГО ПРИ ЗАГРУЗКЕ СТРАНИЦЫ ---
    initializeCardStates();
    formatDateBadges();
    collectWaitingCards();
    if (waitingCards.size) {
        const poller = () => pollWaitingCards();
        poller();
        const intervalId = setInterval(() => {
            if (waitingCards.size === 0) clearInterval(intervalId);
            else poller();
        }, 5000);
    }
    initializeStoredDownloads();
    ensureWidgetState();
    syncExternalDownloads();
    if (widget) {
        setInterval(syncExternalDownloads, 5000);
        window.addEventListener('focus', syncExternalDownloads);
    }
});