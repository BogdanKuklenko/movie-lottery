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

    const registerDownload = (lotteryId, movieName, kinopoiskId, {
        skipSave = false
    } = {}) => {
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
        kinopoiskId, {
            skipRegister = false,
            useKinopoiskStatus = false
        } = {}
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
                updateDownloadView(lotteryId, kinopoiskId, {
                    status: 'error',
                    message: 'Нет связи с qBittorrent'
                });
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
                registerDownload(lotteryId, movieName, kinopoiskId, {
                    skipSave: false
                });
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

    const collectWaitingCards = (map) => {
        if (!gallery) return;
        map.clear();
        gallery.querySelectorAll('.waiting-card').forEach((card) => {
            const lotteryId = card.dataset.lotteryId;
            if (lotteryId) {
                map.set(lotteryId, card);
            }
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
        item.dataset.movieRating = winner.rating_kp != null ? winner.rating_kp : '';
        item.dataset.movieGenres = winner.genres || '';
        item.dataset.movieCountries = winner.countries || '';

        item.innerHTML = `
            <div class="action-buttons">
                <button type="button" class="icon-button download-button" title="Скачать фильм" aria-label="Скачать фильм">
                    <svg class="icon-svg icon-download" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                        <use href="#icon-download"></use>
                    </svg>
                </button>
                <button type="button" class="icon-button search-button" title="Искать торрент" aria-label="Искать торрент">
                    <svg class="icon-svg icon-search" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                        <use href="#icon-search"></use>
                    </svg>
                </button>
                <button type="button" class="icon-button delete-button" title="Удалить лотерею" aria-label="Удалить лотерею">
                    <svg class="icon-svg icon-delete" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                        <use href="#icon-delete"></use>
                    </svg>
                </button>
            </div>
            <div class="date-badge" data-date="${escapeAttr(createdAtIso)}"></div>
            <img src="${escapeAttr(winner.poster || placeholderPoster)}" alt="${escapeHtml(winner.name)}">
        `;

        // Устанавливаем правильное состояние иконок сразу при создании
        const downloadBtn = item.querySelector('.download-button');
        const searchBtn = item.querySelector('.search-button');
        downloadBtn.style.display = winner.has_magnet ? 'inline-flex' : 'none';
        searchBtn.style.display = winner.has_magnet ? 'none' : 'inline-flex';

        return item;
    };

    const pollWaitingCards = (map) => async () => {
        if (!map.size) return;

        const tasks = Array.from(map.entries()).map(async ([lotteryId, cardElement]) => {
            try {
                const data = await fetchLotteryDetails(lotteryId);
                if (data.result) {
                    const newCard = createCompletedCard(lotteryId, data.result, data.createdAt);
                    cardElement.replaceWith(newCard);
                    map.delete(lotteryId);
                    formatDateBadges();
                }
            } catch (error) {
                console.error('Не удалось обновить лотерею', lotteryId, error);
                map.delete(lotteryId);
            }
        });

        await Promise.all(tasks);
    };

    // --- НОВАЯ/ИСПРАВЛЕННАЯ ЛОГИКА ---

    const handleSearchClick = (movieName, movieYear) => {
        if (!movieName) return;
        const parts = [movieName.trim()];
        if (movieYear && movieYear.trim()) {
            parts.push(`(${movieYear.trim()})`);
        }
        const query = encodeURIComponent(parts.join(' '));
        window.open(`https://rutracker.org/forum/tracker.php?nm=${query}`, '_blank');
    };

    const handleDeleteLottery = async (lotteryId, cardElement) => {
        try {
            const response = await fetch(`/delete-lottery/${lotteryId}`, {
                method: 'POST'
            });
            const data = await response.json();
            showToast(data.message, response.ok && data.success ? 'success' : 'error');
            if (response.ok && data.success) {
                cardElement.classList.add('is-deleting');
                removeDownload(lotteryId, cardElement.dataset.kinopoiskId);
                if (waitingCards.has(lotteryId)) {
                    waitingCards.delete(lotteryId);
                }
                setTimeout(() => {
                    cardElement.remove();
                }, 300);
            }
        } catch (error) {
            console.error('Ошибка при удалении лотереи:', error);
            showToast('Не удалось удалить лотерею.', 'error');
        }
    };

    const renderLotteryDetails = (data) => {
        renderParticipantsList(data.movies || [], data.result ? data.result.name : null);
        if (data.result) {
            renderWinnerCard(data.result);
        } else {
            if (modalParticipantsContainer) {
                modalParticipantsContainer.style.display = 'none';
            }
            // Логика для ожидания (если нужно)
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
        if (modalParticipantsContainer) {
            modalParticipantsContainer.style.display = 'none';
        }
        if (modalParticipantsList) {
            modalParticipantsList.innerHTML = '';
        }

        try {
            const data = await fetchLotteryDetails(lotteryId);
            renderLotteryDetails(data);
        } catch (error) {
            modalWinnerInfo.innerHTML = `<p class="error-message">Не удалось загрузить детали: ${escapeHtml(error.message)}</p>`;
        }
    };

    const closeModal = () => {
        if (modalOverlay) {
            modalOverlay.style.display = 'none';
        }
        document.body.classList.remove('no-scroll');
    };

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
            if (Number.isNaN(date.getTime())) return;
            badge.textContent = formatter.format(date);
        });
    };
    
    // ИСПРАВЛЕННАЯ ФУНКЦИЯ
    const initializeCardStates = () => {
        if (!gallery) return;
        gallery.querySelectorAll('.gallery-item').forEach((card) => {
            if (card.classList.contains('waiting-card')) return;
            const hasMagnet = card.dataset.hasMagnet === 'true';
            const downloadBtn = card.querySelector('.download-button');
            const searchBtn = card.querySelector('.search-button');
            
            if (downloadBtn) {
                downloadBtn.style.display = hasMagnet ? 'inline-flex' : 'none';
            }
            if (searchBtn) {
                searchBtn.style.display = hasMagnet ? 'none' : 'inline-flex';
            }
        });
    };

    // --- ГЛАВНЫЙ ОБРАБОТЧИК КЛИКОВ НА ГАЛЕРЕЕ ---
    if (gallery) {
        gallery.addEventListener('click', (event) => {
            const card = event.target.closest('.gallery-item');
            if (!card) return;

            const {
                lotteryId,
                kinopoiskId,
                movieName,
                movieYear
            } = card.dataset;
            const actionButton = event.target.closest('button');
            if (actionButton && card.contains(actionButton)) {
                event.stopPropagation();

                if (actionButton.disabled) {
                    return;
                }

                if (actionButton.classList.contains('download-button')) {
                    handleDownloadClick(kinopoiskId, movieName, lotteryId);
                    return;
                }

                if (actionButton.classList.contains('search-button')) {
                    handleSearchClick(movieName, movieYear);
                    return;
                }

                if (actionButton.classList.contains('delete-button')) {
                    handleDeleteLottery(lotteryId, card);
                    return;
                }
            }

            openModal(lotteryId);
        });
    }

    if (closeButton) closeButton.addEventListener('click', closeModal);
    if (modalOverlay) {
        modalOverlay.addEventListener('click', (event) => {
            if (event.target === modalOverlay) closeModal();
        });
    }

    if (widgetHeader) {
        widgetHeader.addEventListener('click', () => {
            widget.classList.toggle('minimized');
        });
    }

    if (widgetToggleBtn) {
        widgetToggleBtn.addEventListener('click', (event) => {
            event.stopPropagation();
            widget.classList.toggle('minimized');
        });
    }

    // --- ЗАПУСК ВСЕГО ПРИ ЗАГРУЗКЕ СТРАНИЦЫ ---
    initializeCardStates();
    formatDateBadges();
    
    collectWaitingCards(waitingCards);

    if (waitingCards.size) {
        const poller = pollWaitingCards(waitingCards);
        poller();
        const waitingIntervalId = setInterval(() => {
            if (!waitingCards.size) {
                clearInterval(waitingIntervalId);
                return;
            }
            poller();
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