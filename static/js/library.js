// static/js/library.js

document.addEventListener('DOMContentLoaded', () => {
    const gallery = document.querySelector('.library-gallery');
    const modalOverlay = document.getElementById('library-modal');
    const modalBody = document.getElementById('library-modal-body');
    const closeButton = modalOverlay ? modalOverlay.querySelector('.close-button') : null;
    const emptyMessage = document.querySelector('.library-empty-message');

    const widget = document.getElementById('torrent-status-widget');
    const widgetHeader = widget ? widget.querySelector('.widget-header') : null;
    const widgetToggleBtn = widget ? widget.querySelector('#widget-toggle-btn') : null;
    const widgetDownloadsContainer = widget ? widget.querySelector('#widget-downloads') : null;
    const widgetEmptyText = widget ? widget.querySelector('.widget-empty') : null;

    const placeholderPoster = 'https://via.placeholder.com/200x300.png?text=No+Image';
    const ACTIVE_DOWNLOADS_KEY = 'libraryActiveDownloads';

    const pollIntervals = new Map();
    const activeDownloads = new Map();

    let currentModalCard = null;
    let currentModalResourceKey = null;

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

    const formatDateBadges = () => {
        if (!gallery) return;
        gallery.querySelectorAll('.date-badge').forEach((badge) => {
            const iso = badge.dataset.date;
            if (!iso) return;
            const date = new Date(iso);
            if (Number.isNaN(date.getTime())) return;
            const day = String(date.getDate()).padStart(2, '0');
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const year = date.getFullYear();
            badge.textContent = `${day}.${month}.${year}`;
        });
    };

    const ensureEmptyState = () => {
        if (!emptyMessage) return;
        const hasItems = gallery && gallery.querySelector('.gallery-item');
        emptyMessage.style.display = hasItems ? 'none' : 'block';
    };

    const determineResourceKey = (card) => {
        if (!card) return null;
        const kinopoiskId = card.dataset.kinopoiskId;
        return kinopoiskId ? `library-${kinopoiskId}` : null;
    };

    const closeModal = () => {
        if (!modalOverlay) return;
        modalOverlay.style.display = 'none';
        document.body.classList.remove('no-scroll');
        currentModalCard = null;
        currentModalResourceKey = null;
    };

    const saveActiveDownloads = () => {
        if (!widget) return;
        try {
            const payload = Array.from(activeDownloads.values()).map((entry) => ({
                resourceKey: entry.resourceKey,
                movieName: entry.movieName,
                kinopoiskId: entry.kinopoiskId,
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
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
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

    const getOrCreateDownloadElement = (resourceKey) => {
        if (!widgetDownloadsContainer) return null;
        let item = widgetDownloadsContainer.querySelector(`[data-resource-key="${resourceKey}"]`);
        if (!item) {
            item = document.createElement('div');
            item.className = 'widget-download';
            item.dataset.resourceKey = resourceKey;
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

    const registerDownload = (resourceKey, movieName, kinopoiskId, { skipSave = false } = {}) => {
        if (!widget || !resourceKey) return null;
        const existing = activeDownloads.get(resourceKey) || {};
        const updated = {
            resourceKey,
            movieName: movieName || existing.movieName || 'Загрузка...',
            kinopoiskId: kinopoiskId || existing.kinopoiskId || null,
        };
        activeDownloads.set(resourceKey, updated);

        const element = getOrCreateDownloadElement(resourceKey);
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

    const removeDownload = (resourceKey) => {
        if (pollIntervals.has(resourceKey)) {
            clearInterval(pollIntervals.get(resourceKey));
            pollIntervals.delete(resourceKey);
        }
        if (activeDownloads.has(resourceKey)) {
            activeDownloads.delete(resourceKey);
            saveActiveDownloads();
        }
        if (widgetDownloadsContainer) {
            const element = widgetDownloadsContainer.querySelector(`[data-resource-key="${resourceKey}"]`);
            if (element) {
                element.remove();
            }
        }
        ensureWidgetState();
    };

    const updateModalStatus = (resourceKey, data) => {
        if (!modalBody || currentModalResourceKey !== resourceKey) return;
        const statusBlock = modalBody.querySelector('[data-status-block]');
        if (!statusBlock) return;

        const statusTextEl = statusBlock.querySelector('[data-status-text]');
        const progressTextEl = statusBlock.querySelector('[data-progress-text]');
        const speedTextEl = statusBlock.querySelector('[data-speed-text]');
        const etaTextEl = statusBlock.querySelector('[data-eta-text]');
        const peersTextEl = statusBlock.querySelector('[data-peers-text]');
        const barEl = statusBlock.querySelector('[data-progress-bar]');

        const setIdle = (message) => {
            if (statusTextEl) statusTextEl.textContent = message || 'Нет активной загрузки';
            if (progressTextEl) progressTextEl.textContent = '0%';
            if (speedTextEl) speedTextEl.textContent = '0.00 МБ/с';
            if (etaTextEl) etaTextEl.textContent = '--:--';
            if (peersTextEl) peersTextEl.textContent = 'Сиды: 0 / Пиры: 0';
            if (barEl) barEl.style.width = '0%';
        };

        if (!data || data.status === 'not_found') {
            setIdle('Нет активной загрузки');
            return;
        }

        if (data.status === 'error') {
            setIdle('Ошибка загрузки');
            if (peersTextEl) peersTextEl.textContent = data.message || 'qBittorrent недоступен';
            return;
        }

        const progressValue = Number.parseFloat(data.progress) || 0;
        if (statusTextEl) statusTextEl.textContent = data.status ? data.status.toString() : 'Загрузка';
        if (progressTextEl) progressTextEl.textContent = `${progressValue.toFixed(0)}%`;
        if (speedTextEl) {
            const speedValue = Number.parseFloat(data.speed);
            const formattedSpeed = Number.isFinite(speedValue) ? `${speedValue.toFixed(2)} МБ/с` : '0.00 МБ/с';
            speedTextEl.textContent = formattedSpeed;
        }
        if (etaTextEl) etaTextEl.textContent = data.eta || '--:--';
        if (peersTextEl) {
            const seeds = data.seeds ?? 0;
            const peers = data.peers ?? 0;
            peersTextEl.textContent = `Сиды: ${seeds} / Пиры: ${peers}`;
        }
        if (barEl) {
            const clamped = Math.min(100, Math.max(0, progressValue));
            barEl.style.width = `${clamped}%`;
        }
    };

    const updateDownloadView = (resourceKey, data) => {
        if (!widgetDownloadsContainer) return;
        const element = widgetDownloadsContainer.querySelector(`[data-resource-key="${resourceKey}"]`);
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
            updateModalStatus(resourceKey, data);
            return;
        }

        if (data.status === 'not_found') {
            if (progressText) progressText.textContent = 'Ожидание...';
            if (speedText) speedText.textContent = '0.00 МБ/с';
            if (etaText) etaText.textContent = '--:--';
            if (peersText) peersText.textContent = 'Торрент не найден';
            if (bar) bar.style.width = '0%';
            updateModalStatus(resourceKey, data);
            return;
        }

        const progressValue = Number.parseFloat(data.progress) || 0;
        if (bar) bar.style.width = `${Math.min(100, Math.max(0, progressValue))}%`;
        if (progressText) progressText.textContent = `${progressValue.toFixed(0)}%`;
        if (speedText) {
            const speedValue = Number.parseFloat(data.speed);
            speedText.textContent = Number.isFinite(speedValue) ? `${speedValue.toFixed(2)} МБ/с` : '0.00 МБ/с';
        }
        if (etaText) etaText.textContent = data.eta || '--:--';
        if (peersText) peersText.textContent = `Сиды: ${data.seeds ?? 0} / Пиры: ${data.peers ?? 0}`;

        updateModalStatus(resourceKey, data);
    };

    const markDownloadCompleted = (resourceKey) => {
        if (!widgetDownloadsContainer) return;
        const element = widgetDownloadsContainer.querySelector(`[data-resource-key="${resourceKey}"]`);
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

        updateModalStatus(resourceKey, {
            status: 'completed',
            progress: 100,
            speed: '0.00',
            eta: '--:--',
            seeds: 0,
            peers: 0,
        });

        setTimeout(() => removeDownload(resourceKey), 5000);
    };

    const startTorrentStatusPolling = (resourceKey, movieName, kinopoiskId, { skipRegister = false } = {}) => {
        if (!resourceKey) return;
        if (!skipRegister) {
            registerDownload(resourceKey, movieName, kinopoiskId);
        }

        if (pollIntervals.has(resourceKey)) {
            clearInterval(pollIntervals.get(resourceKey));
        }

        const poll = async () => {
            try {
                const response = await fetch(`/api/torrent-status/${encodeURIComponent(resourceKey)}`);
                if (!response.ok) {
                    throw new Error('Сервер вернул ошибку статуса');
                }
                const data = await response.json();

                if (data.status === 'error') {
                    updateDownloadView(resourceKey, data);
                    if (pollIntervals.has(resourceKey)) {
                        clearInterval(pollIntervals.get(resourceKey));
                        pollIntervals.delete(resourceKey);
                    }
                    return;
                }

                updateDownloadView(resourceKey, data);

                const progressValue = Number.parseFloat(data.progress) || 0;
                const statusText = (data.status || '').toLowerCase();
                const isCompleted = progressValue >= 100 || statusText.includes('seeding') || statusText.includes('completed');

                if (isCompleted) {
                    if (pollIntervals.has(resourceKey)) {
                        clearInterval(pollIntervals.get(resourceKey));
                        pollIntervals.delete(resourceKey);
                    }
                    markDownloadCompleted(resourceKey);
                }
            } catch (error) {
                console.error('Ошибка при опросе статуса торрента:', error);
                updateDownloadView(resourceKey, { status: 'error', message: 'Нет связи с qBittorrent' });
                if (pollIntervals.has(resourceKey)) {
                    clearInterval(pollIntervals.get(resourceKey));
                    pollIntervals.delete(resourceKey);
                }
            }
        };

        poll();
        const intervalId = setInterval(poll, 3000);
        pollIntervals.set(resourceKey, intervalId);
    };

    const initializeStoredDownloads = () => {
        if (!widget) return;
        const stored = loadStoredDownloads();
        stored.forEach((entry) => {
            if (!entry || !entry.resourceKey) return;
            startTorrentStatusPolling(entry.resourceKey, entry.movieName, entry.kinopoiskId);
        });
    };

    const refreshCardActions = (card) => {
        if (!card) return;
        const buttons = card.querySelector('.action-buttons');
        if (!buttons) return;

        const hasMagnet = card.dataset.hasMagnet === 'true';
        let downloadBtn = buttons.querySelector('.download-button');

        if (hasMagnet) {
            if (!downloadBtn) {
                downloadBtn = document.createElement('button');
                downloadBtn.className = 'action-button download-button';
                downloadBtn.title = 'Скачать торрент';
                downloadBtn.innerHTML = '&#x2913;';
                buttons.insertBefore(downloadBtn, buttons.firstChild);
            }
        } else if (downloadBtn) {
            downloadBtn.remove();
        }
    };

    const updateModalMagnetState = (card) => {
        if (!modalBody || currentModalCard !== card) return;
        const magnetInput = modalBody.querySelector('#magnet-input');
        const deleteBtn = modalBody.querySelector('.delete-magnet-btn');
        const downloadBtn = modalBody.querySelector('.modal-download-btn');
        const hasMagnet = card.dataset.hasMagnet === 'true';

        if (magnetInput) {
            magnetInput.value = card.dataset.magnetLink || '';
        }
        if (deleteBtn) {
            deleteBtn.style.display = hasMagnet ? 'inline-flex' : 'none';
        }
        if (downloadBtn) {
            downloadBtn.disabled = !hasMagnet || !card.dataset.kinopoiskId;
        }
    };

    const handleSaveMagnet = async (card, magnetLink) => {
        if (!card) return;
        const kinopoiskId = card.dataset.kinopoiskId;
        if (!kinopoiskId) {
            alert('Для этого фильма отсутствует ID Кинопоиска. Магнит-ссылка не может быть сохранена.');
            return;
        }
        try {
            const response = await fetch('/api/movie-magnet', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ kinopoisk_id: Number(kinopoiskId), magnet_link: magnetLink }),
            });
            const data = await response.json();
            alert(data.message);
            if (!response.ok || !data.success) {
                return;
            }
            card.dataset.hasMagnet = data.has_magnet ? 'true' : 'false';
            card.dataset.magnetLink = data.magnet_link || '';
            refreshCardActions(card);
            updateModalMagnetState(card);
        } catch (error) {
            console.error('Ошибка при сохранении magnet-ссылки:', error);
            alert('Произошла ошибка при сохранении magnet-ссылки.');
        }
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

        if (!confirm('Удалить фильм из библиотеки?')) {
            return;
        }

        try {
            const response = await fetch(`/api/library/${movieId}`, { method: 'DELETE' });
            const data = await response.json();
            if (!response.ok || !data.success) {
                throw new Error(data.message || 'Не удалось удалить фильм.');
            }

            closeModal();
            removeCardFromDom(card);
        } catch (error) {
            alert(error.message);
        }
    };

    const handleDownload = async (card) => {
        if (!card) return;
        const kinopoiskId = card.dataset.kinopoiskId;
        const movieName = card.dataset.movieName;
        const hasMagnet = card.dataset.hasMagnet === 'true';
        if (!kinopoiskId || !hasMagnet) {
            alert('Сначала добавьте magnet-ссылку для этого фильма.');
            renderModal(card);
            return;
        }

        const resourceKey = determineResourceKey(card);
        registerDownload(resourceKey, movieName, kinopoiskId);

        try {
            const response = await fetch(`/api/start-download/${kinopoiskId}?source=library`, { method: 'POST' });
            const data = await response.json();
            if (data.success) {
                startTorrentStatusPolling(resourceKey, movieName, kinopoiskId, { skipRegister: true });
            } else {
                alert(`Ошибка: ${data.message}`);
                removeDownload(resourceKey);
            }
        } catch (error) {
            console.error('Ошибка при запуске скачивания:', error);
            alert('Произошла критическая ошибка.');
            removeDownload(resourceKey);
        }
    };

    const fetchStatusOnce = async (resourceKey) => {
        if (!resourceKey) return;
        try {
            const response = await fetch(`/api/torrent-status/${encodeURIComponent(resourceKey)}`);
            if (!response.ok) return;
            const data = await response.json();
            updateModalStatus(resourceKey, data);
        } catch (error) {
            console.warn('Не удалось получить статус загрузки:', error);
        }
    };

    const renderModal = (card) => {
        if (!modalOverlay || !modalBody || !card) return;
        currentModalCard = card;
        currentModalResourceKey = determineResourceKey(card);

        const rawMovieName = card.dataset.movieName || 'Неизвестный фильм';
        const rawMovieYear = card.dataset.movieYear || '';
        const rawMoviePoster = card.dataset.moviePoster || '';
        const rawMovieDescription = card.dataset.movieDescription || '';
        const rawMovieGenres = card.dataset.movieGenres || '';
        const rawMovieCountries = card.dataset.movieCountries || '';
        const rawMovieRating = card.dataset.movieRating || '';
        const rawMagnetLink = card.dataset.magnetLink || '';

        const hasMagnet = card.dataset.hasMagnet === 'true';
        const kinopoiskId = card.dataset.kinopoiskId;
        const ratingValue = parseFloat(rawMovieRating);
        let ratingBadge = '';
        if (!Number.isNaN(ratingValue)) {
            const ratingClass = ratingValue >= 7 ? 'rating-high' : ratingValue >= 5 ? 'rating-medium' : 'rating-low';
            ratingBadge = `<div class="rating-badge ${ratingClass}">${ratingValue.toFixed(1)}</div>`;
        }

        const posterSrc = rawMoviePoster || placeholderPoster;
        const safeMovieName = escapeHtml(rawMovieName);
        const safeMovieYear = escapeHtml(rawMovieYear);
        const safeGenres = escapeHtml(rawMovieGenres || 'н/д');
        const safeCountries = escapeHtml(rawMovieCountries || 'н/д');
        const safeDescription = escapeHtml(rawMovieDescription || 'Описание отсутствует.');
        const safeMagnetValue = escapeAttr(rawMagnetLink);

        const magnetSection = kinopoiskId
            ? `
                <div class="magnet-form">
                    <label for="magnet-input">Magnet-ссылка:</label>
                    <input type="text" id="magnet-input" value="${safeMagnetValue}" placeholder="Вставьте magnet-ссылку и нажмите Сохранить...">
                    <div class="magnet-actions">
                        <button class="action-button save-magnet-btn">Сохранить</button>
                        <button class="action-button-delete delete-magnet-btn" style="display: ${hasMagnet ? 'inline-flex' : 'none'};">Удалить ссылку</button>
                    </div>
                </div>
            `
            : '<p class="magnet-hint">Для сохранения magnet-ссылки требуется ID фильма на Кинопоиске.</p>';

        modalBody.innerHTML = `
            <div class="winner-card">
                <div class="winner-poster">
                    <img src="${escapeAttr(posterSrc)}" alt="Постер ${safeMovieName}">
                    ${ratingBadge}
                </div>
                <div class="winner-details">
                    <h2>${safeMovieName}${safeMovieYear ? ` (${safeMovieYear})` : ''}</h2>
                    <p class="meta-info">${safeGenres} / ${safeCountries}</p>
                    <p class="description">${safeDescription}</p>
                    ${magnetSection}
                    <div class="library-modal-actions">
                        <button class="secondary-button modal-download-btn" ${!hasMagnet || !kinopoiskId ? 'disabled' : ''}>Скачать торрент</button>
                        <button class="secondary-button modal-search-btn">Искать торрент</button>
                        <button class="danger-button modal-delete-btn">Удалить из библиотеки</button>
                    </div>
                    <div class="download-status" data-status-block>
                        <div class="status-progress-track">
                            <div class="status-progress-bar" data-progress-bar style="width: 0%;"></div>
                        </div>
                        <div class="status-grid">
                            <div><span class="status-label">Статус:</span> <span data-status-text>Нет активной загрузки</span></div>
                            <div><span class="status-label">Прогресс:</span> <span data-progress-text>0%</span></div>
                            <div><span class="status-label">Скорость:</span> <span data-speed-text>0.00 МБ/с</span></div>
                            <div><span class="status-label">Оставшееся время:</span> <span data-eta-text>--:--</span></div>
                            <div><span class="status-label">Сиды / Пиры:</span> <span data-peers-text>Сиды: 0 / Пиры: 0</span></div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        modalOverlay.style.display = 'flex';
        document.body.classList.add('no-scroll');

        const searchBtn = modalBody.querySelector('.modal-search-btn');
        if (searchBtn) {
            searchBtn.addEventListener('click', () => handleSearch(rawMovieName, rawMovieYear));
        }

        const deleteBtn = modalBody.querySelector('.modal-delete-btn');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', () => handleDelete(card));
        }

        const downloadBtn = modalBody.querySelector('.modal-download-btn');
        if (downloadBtn) {
            downloadBtn.addEventListener('click', () => handleDownload(card));
        }

        const saveBtn = modalBody.querySelector('.save-magnet-btn');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => {
                const input = modalBody.querySelector('#magnet-input');
                handleSaveMagnet(card, input ? input.value.trim() : '');
            });
        }

        const deleteMagnetBtn = modalBody.querySelector('.delete-magnet-btn');
        if (deleteMagnetBtn) {
            deleteMagnetBtn.addEventListener('click', () => {
                if (confirm('Удалить сохраненную magnet-ссылку?')) {
                    handleSaveMagnet(card, '');
                }
            });
        }

        if (currentModalResourceKey) {
            fetchStatusOnce(currentModalResourceKey);
        }
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

    formatDateBadges();
    ensureEmptyState();
    initializeStoredDownloads();
});
