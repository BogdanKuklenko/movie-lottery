// static/js/library.js

document.addEventListener('DOMContentLoaded', () => {
    const gallery = document.querySelector('.library-gallery');
    const modalOverlay = document.getElementById('library-modal');
    const modalBody = document.getElementById('library-modal-body');
    const closeButton = modalOverlay ? modalOverlay.querySelector('.close-button') : null;
    const emptyMessage = document.querySelector('.library-empty-message');
    const placeholderPoster = 'https://via.placeholder.com/200x300.png?text=No+Image';

    const widget = document.getElementById('torrent-status-widget');
    const widgetHeader = widget ? widget.querySelector('.widget-header') : null;
    const widgetToggleBtn = widget ? widget.querySelector('#widget-toggle-btn') : null;
    const widgetDownloadsContainer = widget ? widget.querySelector('#widget-downloads') : null;
    const widgetEmptyText = widget ? widget.querySelector('.widget-empty') : null;

    const ACTIVE_DOWNLOADS_KEY = 'libraryActiveDownloads';

    const pollIntervals = new Map();
    const activeDownloads = new Map();

    const getDownloadKey = (movieId, kinopoiskId) => {
        if (kinopoiskId) {
            return `kp-${kinopoiskId}`;
        }
        if (movieId) {
            return `lib-${movieId}`;
        }
        return null;
    };

    const normalizeId = (value) => (value === null || value === undefined ? '' : String(value));

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

    const safeJsonParse = (value) => {
        try {
            return JSON.parse(value);
        } catch (error) {
            return null;
        }
    };

    const saveActiveDownloads = () => {
        if (!widget) return;
        try {
            const payload = Array.from(activeDownloads.values()).map((entry) => ({
                key: entry.key,
                movieId: entry.movieId || null,
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
                key: entry.key || getDownloadKey(entry.movieId, entry.kinopoiskId),
                movieId: entry.movieId != null ? String(entry.movieId) : '',
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

    const getOrCreateDownloadElement = (movieId, kinopoiskId) => {
        if (!widgetDownloadsContainer) return null;
        const key = getDownloadKey(movieId, kinopoiskId);
        if (!key) return null;
        let item = widgetDownloadsContainer.querySelector(`[data-download-key="${key}"]`);
        if (!item) {
            item = document.createElement('div');
            item.className = 'widget-download';
            item.dataset.downloadKey = key;
            item.dataset.movieId = normalizeId(movieId);
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

    const registerDownload = (movieId, movieName, kinopoiskId, { skipSave = false } = {}) => {
        const key = getDownloadKey(movieId, kinopoiskId);
        if (!key) return null;
        const existing = activeDownloads.get(key) || {};
        const updated = {
            ...existing,
            key,
            movieId: movieId != null ? String(movieId) : existing.movieId || '',
            movieName: movieName || existing.movieName || 'Фильм',
            kinopoiskId: kinopoiskId != null ? String(kinopoiskId) : existing.kinopoiskId || '',
        };
        activeDownloads.set(key, updated);
        const element = getOrCreateDownloadElement(updated.movieId, updated.kinopoiskId);
        if (element) {
            element.dataset.movieId = normalizeId(updated.movieId);
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

    const resolveDownloadKey = (movieId, kinopoiskId) => {
        let key = getDownloadKey(movieId, kinopoiskId);
        if (key && activeDownloads.has(key)) {
            return key;
        }
        if (movieId != null) {
            const searchId = String(movieId);
            for (const entry of activeDownloads.values()) {
                if (entry.movieId === searchId) {
                    return entry.key;
                }
            }
        }
        return null;
    };

    const removeDownload = (movieId, kinopoiskId) => {
        const key = resolveDownloadKey(movieId, kinopoiskId);
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

    const updateDownloadView = (movieId, kinopoiskId, data) => {
        if (!widgetDownloadsContainer) return;
        const key = resolveDownloadKey(movieId, kinopoiskId);
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

    const markDownloadCompleted = (movieId, kinopoiskId) => {
        if (!widgetDownloadsContainer) return;
        const key = resolveDownloadKey(movieId, kinopoiskId);
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

        setTimeout(() => removeDownload(movieId, kinopoiskId), 5000);
    };

    const startTorrentStatusPolling = (
        movieId,
        movieName,
        kinopoiskId,
        { skipRegister = false, useKinopoiskStatus = false } = {}
    ) => {
        const key = getDownloadKey(movieId, kinopoiskId);
        if (!key) return;
        if (!skipRegister) {
            registerDownload(movieId, movieName, kinopoiskId);
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
                } else if (movieId) {
                    const response = await fetch(`/api/library/torrent-status/${movieId}`);
                    if (!response.ok) {
                        throw new Error('Сервер вернул ошибку статуса');
                    }
                    data = await response.json();
                } else {
                    return;
                }

                if (data.status === 'error') {
                    updateDownloadView(movieId, kinopoiskId, data);
                    if (pollIntervals.has(key)) {
                        clearInterval(pollIntervals.get(key));
                        pollIntervals.delete(key);
                    }
                    return;
                }

                if (data.status === 'not_found' && useKinopoiskStatus) {
                    removeDownload(movieId, kinopoiskId);
                    if (pollIntervals.has(key)) {
                        clearInterval(pollIntervals.get(key));
                        pollIntervals.delete(key);
                    }
                    return;
                }

                updateDownloadView(movieId, kinopoiskId, data);

                const progressValue = Number.parseFloat(data.progress) || 0;
                const statusText = (data.status || '').toLowerCase();
                const isCompleted = progressValue >= 100 || statusText.includes('seeding') || statusText.includes('completed');

                if (isCompleted) {
                    if (pollIntervals.has(key)) {
                        clearInterval(pollIntervals.get(key));
                        pollIntervals.delete(key);
                    }
                    markDownloadCompleted(movieId, kinopoiskId);
                }
            } catch (error) {
                console.error('Ошибка при опросе статуса торрента:', error);
                updateDownloadView(movieId, kinopoiskId, { status: 'error', message: 'Нет связи с qBittorrent' });
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
            if (!entry || !entry.movieId) return;
            startTorrentStatusPolling(entry.movieId, entry.movieName, entry.kinopoiskId, {
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
                const movieId = card.dataset.movieId;
                const movieName = card.dataset.movieName || item.name;
                registerDownload(movieId, movieName, kinopoiskId, { skipSave: false });
                updateDownloadView(movieId, kinopoiskId, item);
                startTorrentStatusPolling(movieId, movieName, kinopoiskId, {
                    skipRegister: true,
                    useKinopoiskStatus: true,
                });
            });
        } catch (error) {
            console.warn('Не удалось синхронизировать активные загрузки:', error);
        }
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

    const ensureEmptyState = () => {
        if (!emptyMessage) return;
        const hasItems = gallery && gallery.querySelector('.gallery-item');
        emptyMessage.style.display = hasItems ? 'none' : 'block';
    };

    const closeModal = () => {
        if (!modalOverlay) return;
        modalOverlay.style.display = 'none';
        document.body.classList.remove('no-scroll');
    };

    const handleSearch = (name, year) => {
        if (!name) return;
        const parts = [name.trim()];
        if (year && year.trim()) {
            parts.push(`(${year.trim()})`);
        }
        const query = encodeURIComponent(parts.join(' '));
        window.open(`https://rutracker.org/forum/tracker.php?nm=${query}`, '_blank');
    };

    const removeCardFromDom = (card) => {
        if (!card) return;
        card.classList.add('is-deleting');
        setTimeout(() => {
            card.remove();
            ensureEmptyState();
        }, 300);
    };

    const handleDelete = async (card) => {
        if (!card) return;
        const movieId = card.dataset.movieId;
        if (!movieId) return;

        try {
            const response = await fetch(`/api/library/${movieId}`, { method: 'DELETE' });
            const data = await response.json();
            if (!response.ok || !data.success) {
                throw new Error(data.message || 'Не удалось удалить фильм.');
            }

            closeModal();
            removeDownload(movieId, card.dataset.kinopoiskId);
            removeCardFromDom(card);
            showToast(data.message || 'Фильм удален из библиотеки.', 'success');
        } catch (error) {
            showToast(error.message, 'error');
        }
    };

    const updateCardMagnetState = (card, { hasMagnet, magnetLink }) => {
        if (!card) return;
        const normalized = Boolean(hasMagnet);
        card.dataset.hasMagnet = normalized ? 'true' : 'false';
        card.dataset.magnetLink = magnetLink || '';
        const downloadBtn = card.querySelector('.download-button');
        const kinopoiskId = card.dataset.kinopoiskId;
        if (downloadBtn) {
            const canDownload = normalized && Boolean(kinopoiskId);
            if (canDownload) {
                downloadBtn.removeAttribute('disabled');
                downloadBtn.title = 'Скачать торрент';
            } else {
                downloadBtn.setAttribute('disabled', 'disabled');
                downloadBtn.title = kinopoiskId ? 'Добавьте magnet-ссылку, чтобы скачать' : 'kinopoisk_id не указан';
            }
        }
    };

    const handleSaveMagnet = async (card, magnetLink) => {
        if (!card) return;
        const kinopoiskId = card.dataset.kinopoiskId;
        if (!kinopoiskId) {
            showToast('Для этого фильма не указан kinopoisk_id.', 'error');
            return;
        }

        const payload = {
            kinopoisk_id: Number(kinopoiskId),
            magnet_link: (magnetLink || '').trim(),
        };

        try {
            const response = await fetch('/api/movie-magnet', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const data = await response.json();
            showToast(data.message, data.success ? 'success' : 'error');
            if (!response.ok || !data.success) {
                return;
            }

            updateCardMagnetState(card, { hasMagnet: data.has_magnet, magnetLink: data.magnet_link });
            if (modalOverlay && modalOverlay.style.display === 'flex') {
                renderModal(card);
            }
        } catch (error) {
            console.error('Ошибка при сохранении magnet-ссылки:', error);
            showToast('Произошла критическая ошибка.', 'error');
        }
    };

    const handleDeleteMagnet = (card) => {
        if (!card) return;
        handleSaveMagnet(card, '');
    };

    const handleDownload = async (card) => {
        if (!card) return;
        const movieId = card.dataset.movieId;
        const kinopoiskId = card.dataset.kinopoiskId;
        if (!movieId) return;
        if (!kinopoiskId) {
            showToast('Для этого фильма не указан kinopoisk_id.', 'error');
            return;
        }
        if (card.dataset.hasMagnet !== 'true') {
            showToast('Сначала добавьте magnet-ссылку для этого фильма.', 'warning');
            renderModal(card);
            return;
        }

        registerDownload(movieId, card.dataset.movieName, kinopoiskId);
        try {
            const response = await fetch(`/api/library/start-download/${movieId}`, { method: 'POST' });
            const data = await response.json();
            if (data.success) {
                startTorrentStatusPolling(movieId, card.dataset.movieName, kinopoiskId, { skipRegister: true });
                showToast('Загрузка началась.', 'success');
            } else {
                showToast(data.message || 'Не удалось начать загрузку.', 'error');
                removeDownload(movieId, kinopoiskId);
            }
        } catch (error) {
            console.error('Ошибка при запуске скачивания:', error);
            showToast('Произошла критическая ошибка.', 'error');
            removeDownload(movieId, kinopoiskId);
        }
    };

    const renderModal = (card) => {
        if (!modalOverlay || !modalBody || !card) return;
        const {
            movieName = 'Неизвестный фильм',
            movieYear = '',
            moviePoster = '',
            movieDescription = '',
            movieGenres = '',
            movieCountries = '',
            movieRating = '',
            kinopoiskId = '',
            magnetLink = '',
            hasMagnet = 'false',
        } = card.dataset;

        const ratingValue = parseFloat(movieRating);
        let ratingBadge = '';
        if (!Number.isNaN(ratingValue)) {
            const ratingClass = ratingValue >= 7 ? 'rating-high' : ratingValue >= 5 ? 'rating-medium' : 'rating-low';
            ratingBadge = `<div class="rating-badge ${ratingClass}">${ratingValue.toFixed(1)}</div>`;
        }

        const canDownload = hasMagnet === 'true' && Boolean(kinopoiskId);
        const hasKinopoisk = Boolean(kinopoiskId);
        const posterUrl = moviePoster || placeholderPoster;

        modalBody.innerHTML = `
            <div class="winner-card">
                <div class="winner-poster">
                    <img src="${escapeAttr(posterUrl)}" alt="Постер ${escapeAttr(movieName)}">
                    ${ratingBadge}
                </div>
                <div class="winner-details">
                    <h2>${escapeHtml(movieName)}${movieYear ? ` (${escapeHtml(movieYear)})` : ''}</h2>
                    <p class="meta-info">${escapeHtml(movieGenres || 'н/д')} / ${escapeHtml(movieCountries || 'н/д')}</p>
                    <p class="description">${escapeHtml(movieDescription || 'Описание отсутствует.')}</p>
                    ${hasKinopoisk
                        ? `
                            <div class="magnet-form">
                                <label for="magnet-input">Magnet-ссылка:</label>
                                <input type="text" id="magnet-input" value="${escapeAttr(magnetLink)}" placeholder="Вставьте magnet-ссылку и нажмите Сохранить...">
                                <div class="magnet-actions">
                                    <button type="button" class="action-button save-magnet-btn">Сохранить</button>
                                    ${hasMagnet === 'true' ? '<button type="button" class="action-button-delete delete-magnet-btn">Удалить ссылку</button>' : ''}
                                </div>
                            </div>
                        `
                        : '<p class="meta-info">Для этого фильма не указан Kinopoisk ID, поэтому magnet-ссылку сохранить нельзя.</p>'
                    }
                    <div class="library-modal-actions">
                        <button class="secondary-button modal-download-btn"${canDownload ? '' : ' disabled'}>Скачать торрент</button>
                        <button class="secondary-button modal-search-btn">Искать торрент</button>
                        <button class="danger-button modal-delete-btn">Удалить из библиотеки</button>
                    </div>
                </div>
            </div>
        `;

        const searchBtn = modalBody.querySelector('.modal-search-btn');
        if (searchBtn) {
            searchBtn.addEventListener('click', () => handleSearch(movieName, movieYear));
        }

        const deleteBtn = modalBody.querySelector('.modal-delete-btn');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', () => handleDelete(card));
        }

        const downloadBtn = modalBody.querySelector('.modal-download-btn');
        if (downloadBtn && canDownload) {
            downloadBtn.addEventListener('click', () => handleDownload(card));
        }

        const saveBtn = modalBody.querySelector('.save-magnet-btn');
        const magnetInput = modalBody.querySelector('#magnet-input');
        if (saveBtn && magnetInput) {
            saveBtn.addEventListener('click', () => handleSaveMagnet(card, magnetInput.value));
        }
        if (magnetInput) {
            magnetInput.addEventListener('keydown', (event) => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    handleSaveMagnet(card, magnetInput.value);
                }
            });
        }

        const deleteMagnetBtn = modalBody.querySelector('.delete-magnet-btn');
        if (deleteMagnetBtn) {
            deleteMagnetBtn.addEventListener('click', () => handleDeleteMagnet(card));
        }

        modalOverlay.style.display = 'flex';
        document.body.classList.add('no-scroll');
    };

    if (gallery) {
        gallery.addEventListener('click', (event) => {
            const card = event.target.closest('.gallery-item');
            if (!card) return;

            if (event.target.classList.contains('download-button')) {
                event.stopPropagation();
                handleDownload(card);
                return;
            }

            if (event.target.classList.contains('search-button')) {
                event.stopPropagation();
                handleSearch(card.dataset.movieName, card.dataset.movieYear);
                return;
            }

            if (event.target.classList.contains('delete-button')) {
                event.stopPropagation();
                handleDelete(card);
                return;
            }

            renderModal(card);
        });
    }

    if (closeButton) {
        closeButton.addEventListener('click', closeModal);
    }

    if (modalOverlay) {
        modalOverlay.addEventListener('click', (event) => {
            if (event.target === modalOverlay) {
                closeModal();
            }
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

    const initializeCardStates = () => {
        if (!gallery) return;
        gallery.querySelectorAll('.gallery-item').forEach((card) => {
            updateCardMagnetState(card, {
                hasMagnet: card.dataset.hasMagnet === 'true',
                magnetLink: card.dataset.magnetLink || '',
            });
        });
    };

    initializeCardStates();
    formatDateBadges();
    ensureEmptyState();
    initializeStoredDownloads();
    ensureWidgetState();
    syncExternalDownloads();
    if (widget) {
        setInterval(syncExternalDownloads, 5000);
        window.addEventListener('focus', syncExternalDownloads);
    }
});
