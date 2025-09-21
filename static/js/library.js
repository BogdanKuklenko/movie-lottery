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
        if (kinopoiskId) return `kp-${kinopoiskId}`;
        if (movieId) return `lib-${movieId}`;
        return null;
    };

    const normalizeId = (value) => (value === null || value === undefined ? '' : String(value));

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
        if (widgetEmptyText) widgetEmptyText.style.display = hasDownloads ? 'none' : 'block';
        if (widgetDownloadsContainer) widgetDownloadsContainer.style.display = hasDownloads ? 'block' : 'none';
        if (hasDownloads) widget.classList.remove('minimized');
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
            const title = element.querySelector('.widget-download-title');
            if (title) title.textContent = `Загрузка: ${updated.movieName}`;
        }
        ensureWidgetState();
        if (!skipSave) saveActiveDownloads();
        return updated;
    };

    const resolveDownloadKey = (movieId, kinopoiskId) => {
        let key = getDownloadKey(movieId, kinopoiskId);
        if (key && activeDownloads.has(key)) return key;
        if (movieId != null) {
            const searchId = String(movieId);
            for (const entry of activeDownloads.values()) {
                if (entry.movieId === searchId) return entry.key;
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
            if (element) element.remove();
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

    const markDownloadCompleted = (movieId, kinopoiskId) => {
        if (!widgetDownloadsContainer) return;
        const key = resolveDownloadKey(movieId, kinopoiskId);
        if (!key) return;
        const element = widgetDownloadsContainer.querySelector(`[data-download-key="${key}"]`);
        if (!element) return;
        const speedText = element.querySelector('.speed-text');
        if (speedText) speedText.textContent = 'Готово';
        setTimeout(() => removeDownload(movieId, kinopoiskId), 5000);
    };

    const startTorrentStatusPolling = (movieId, movieName, kinopoiskId, { skipRegister = false, useKinopoiskStatus = false } = {}) => {
        const key = getDownloadKey(movieId, kinopoiskId);
        if (!key) return;
        if (!skipRegister) registerDownload(movieId, movieName, kinopoiskId);
        if (pollIntervals.has(key)) clearInterval(pollIntervals.get(key));

        const poll = async () => {
            try {
                let data, response;
                if (useKinopoiskStatus && kinopoiskId) {
                    response = await fetch(`/api/download-status/${kinopoiskId}`);
                } else if (movieId) {
                    response = await fetch(`/api/library/torrent-status/${movieId}`);
                } else return;

                if (!response.ok) throw new Error('Сервер вернул ошибку статуса');
                data = await response.json();

                if (data.status === 'error' || (data.status === 'not_found' && useKinopoiskStatus)) {
                    updateDownloadView(movieId, kinopoiskId, data);
                    clearInterval(pollIntervals.get(key));
                    pollIntervals.delete(key);
                    if (data.status === 'not_found') removeDownload(movieId, kinopoiskId);
                    return;
                }

                updateDownloadView(movieId, kinopoiskId, data);
                const progressValue = Number.parseFloat(data.progress) || 0;
                const statusText = (data.status || '').toLowerCase();
                if (progressValue >= 100 || statusText.includes('seeding') || statusText.includes('completed')) {
                    clearInterval(pollIntervals.get(key));
                    pollIntervals.delete(key);
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
        loadStoredDownloads().forEach(entry => {
            if (entry && entry.movieId) {
                startTorrentStatusPolling(entry.movieId, entry.movieName, entry.kinopoiskId, { useKinopoiskStatus: !!entry.kinopoiskId });
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
                const movieId = card.dataset.movieId;
                const movieName = card.dataset.movieName || item.name;
                registerDownload(movieId, movieName, kinopoiskId);
                updateDownloadView(movieId, kinopoiskId, item);
                startTorrentStatusPolling(movieId, movieName, kinopoiskId, { skipRegister: true, useKinopoiskStatus: true });
            });
        } catch (error) {
            console.warn('Не удалось синхронизировать активные загрузки:', error);
        }
    };

    const formatDateBadges = () => {
        if (!gallery) return;
        const formatter = new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
        gallery.querySelectorAll('.date-badge').forEach((badge) => {
            const iso = badge.dataset.date;
            if (iso) {
                const date = new Date(iso);
                if (!isNaN(date.getTime())) badge.textContent = formatter.format(date);
            }
        });
    };

    const ensureEmptyState = () => {
        if (!emptyMessage || !gallery) return;
        emptyMessage.style.display = gallery.querySelector('.gallery-item') ? 'none' : 'block';
    };

    const closeModal = () => {
        if (!modalOverlay) return;
        modalOverlay.style.display = 'none';
        document.body.classList.remove('no-scroll');
    };

    const removeCardFromDom = (card) => {
        if (!card) return;
        card.classList.add('is-deleting');
        card.addEventListener('transitionend', () => {
            card.remove();
            ensureEmptyState();
        });
    };

    const handleDelete = async (card) => {
        if (!card) return;
        const movieId = card.dataset.movieId;
        if (!movieId) return;
        try {
            const response = await fetch(`/api/library/${movieId}`, { method: 'DELETE' });
            const data = await response.json();
            if (!response.ok || !data.success) throw new Error(data.message || 'Не удалось удалить фильм.');
            closeModal();
            removeDownload(movieId, card.dataset.kinopoiskId);
            removeCardFromDom(card);
            showToast(data.message || 'Фильм удален из библиотеки.', 'success');
        } catch (error) {
            showToast(error.message, 'error');
        }
    };
    
    // ИСПРАВЛЕННАЯ ФУНКЦИЯ ДЛЯ ИКОНОК
    const initializeCardStates = () => {
        if (!gallery) return;
        gallery.querySelectorAll('.gallery-item:not(.waiting-card)').forEach((card) => {
            const hasMagnet = card.dataset.hasMagnet === 'true';
            const downloadBtn = card.querySelector('.download-button');
            const searchBtn = card.querySelector('.search-button');
            if (downloadBtn) downloadBtn.style.display = hasMagnet ? 'inline-flex' : 'none';
            if (searchBtn) searchBtn.style.display = hasMagnet ? 'none' : 'inline-flex';
        });
    };

    const handleSaveMagnet = async (card, magnetLink) => {
        if (!card) return;
        const kinopoiskId = card.dataset.kinopoiskId;
        if (!kinopoiskId) return showToast('Для этого фильма не указан kinopoisk_id.', 'error');
        
        try {
            const response = await fetch('/api/movie-magnet', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ kinopoisk_id: Number(kinopoiskId), magnet_link: (magnetLink || '').trim() }),
            });
            const data = await response.json();
            showToast(data.message, data.success ? 'success' : 'error');
            if (!response.ok || !data.success) return;

            card.dataset.hasMagnet = data.has_magnet ? 'true' : 'false';
            card.dataset.magnetLink = data.magnet_link || '';
            initializeCardStates(); // Обновляем иконки на главной странице
            if (modalOverlay.style.display === 'flex') renderModal(card); // Перерисовываем модальное окно
        } catch (error) {
            console.error('Ошибка при сохранении magnet-ссылки:', error);
            showToast('Произошла критическая ошибка.', 'error');
        }
    };

    const handleDownload = async (card) => {
        if (!card) return;
        const { movieId, kinopoiskId, movieName, hasMagnet } = card.dataset;
        if (!movieId || !kinopoiskId) return showToast('Для фильма не указан ID.', 'error');
        if (hasMagnet !== 'true') {
            showToast('Сначала добавьте magnet-ссылку.', 'warning');
            renderModal(card);
            return;
        }

        registerDownload(movieId, movieName, kinopoiskId);
        try {
            const response = await fetch(`/api/library/start-download/${movieId}`, { method: 'POST' });
            const data = await response.json();
            if (data.success) {
                startTorrentStatusPolling(movieId, movieName, kinopoiskId, { skipRegister: true });
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
    
    // НОВАЯ ЛОГИКА ДЛЯ СЛАЙДЕРА
    
    const handleDeleteTorrent = async (torrentHash, card) => {
        try {
            const response = await fetch(`/api/delete-torrent/${torrentHash}`, { method: 'POST' });
            const data = await response.json();
            showToast(data.message, data.success ? 'success' : 'error');
            if (data.success) {
                card.classList.remove('has-torrent-on-client');
                card.dataset.isOnClient = 'false';
                if (modalOverlay.style.display === 'flex') renderModal(card);
            }
        } catch(e) {
            showToast('Критическая ошибка при удалении торрента.', 'error');
        }
    };

    const initSlider = (sliderContainer, card) => {
        const thumb = sliderContainer.querySelector('.slide-to-delete-thumb');
        const track = sliderContainer.querySelector('.slide-to-delete-track');
        const fill = sliderContainer.querySelector('.slide-to-delete-fill');
        if (!thumb || !track || !fill) return;

        let isDragging = false, startX = 0;
        const maxDrag = track.offsetWidth - thumb.offsetWidth - 4;

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
            const moveX = currentX - startX;

            if (moveX > maxDrag * 0.9) {
                handleDeleteTorrent(card.dataset.torrentHash, card);
            } else {
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

    const renderModal = (card) => {
        if (!modalOverlay || !modalBody || !card) return;
        const ds = card.dataset;
        const ratingValue = parseFloat(ds.movieRating);
        let ratingBadge = '';
        if (!isNaN(ratingValue)) {
            const ratingClass = ratingValue >= 7 ? 'rating-high' : ratingValue >= 5 ? 'rating-medium' : 'rating-low';
            ratingBadge = `<div class="rating-badge ${ratingClass}">${ratingValue.toFixed(1)}</div>`;
        }

        modalBody.innerHTML = `
            <div class="winner-card">
                <div class="winner-poster">
                    <img src="${escapeAttr(ds.moviePoster || placeholderPoster)}" alt="Постер ${escapeAttr(ds.movieName)}">
                    ${ratingBadge}
                </div>
                <div class="winner-details">
                    <h2>${escapeHtml(ds.movieName)}${ds.movieYear ? ` (${escapeHtml(ds.movieYear)})` : ''}</h2>
                    <p class="meta-info">${escapeHtml(ds.movieGenres || 'н/д')} / ${escapeHtml(ds.movieCountries || 'н/д')}</p>
                    <p class="description">${escapeHtml(ds.movieDescription || 'Описание отсутствует.')}</p>
                    ${ds.kinopoiskId ? `
                        <div class="magnet-form">
                            <label for="magnet-input">Magnet-ссылка:</label>
                            <input type="text" id="magnet-input" value="${escapeAttr(ds.magnetLink)}" placeholder="Вставьте magnet-ссылку...">
                            <div class="magnet-actions">
                                <button type="button" class="action-button save-magnet-btn">Сохранить</button>
                                ${ds.hasMagnet === 'true' ? '<button type="button" class="action-button-delete delete-magnet-btn">Удалить</button>' : ''}
                            </div>
                        </div>` : '<p class="meta-info">Kinopoisk ID не указан, сохранение magnet-ссылки недоступно.</p>'}
                    <div class="library-modal-actions">
                        <button class="secondary-button modal-download-btn"${ds.hasMagnet === 'true' ? '' : ' disabled'}>Скачать</button>
                        <button class="danger-button modal-delete-btn">Удалить из библиотеки</button>
                    </div>
                    <div class="slide-to-delete-container ${ds.isOnClient === 'true' ? '' : 'disabled'}">
                        <div class="slide-to-delete-track">
                            <div class="slide-to-delete-fill"></div>
                            <span class="slide-to-delete-text">Удалить с клиента</span>
                            <div class="slide-to-delete-thumb">&gt;</div>
                        </div>
                    </div>
                </div>
            </div>`;
        
        modalBody.querySelector('.modal-delete-btn').addEventListener('click', () => handleDelete(card));
        if (modalBody.querySelector('.modal-download-btn')) {
            modalBody.querySelector('.modal-download-btn').addEventListener('click', () => handleDownload(card));
        }
        if (modalBody.querySelector('.save-magnet-btn')) {
            const magnetInput = modalBody.querySelector('#magnet-input');
            modalBody.querySelector('.save-magnet-btn').addEventListener('click', () => handleSaveMagnet(card, magnetInput.value));
        }
        if (modalBody.querySelector('.delete-magnet-btn')) {
            modalBody.querySelector('.delete-magnet-btn').addEventListener('click', () => handleSaveMagnet(card, ''));
        }
        const slider = modalBody.querySelector('.slide-to-delete-container');
        if (slider && !slider.classList.contains('disabled')) {
            initSlider(slider, card);
        }

        modalOverlay.style.display = 'flex';
        document.body.classList.add('no-scroll');
    };

    if (gallery) {
        gallery.addEventListener('click', (event) => {
            const card = event.target.closest('.gallery-item');
            if (!card) return;

            const actionButton = event.target.closest('button');
            if (actionButton && card.contains(actionButton)) {
                event.stopPropagation();
                if (actionButton.disabled) return;
                if (actionButton.classList.contains('download-button')) handleDownload(card);
                else if (actionButton.classList.contains('search-button')) handleSearch(card.dataset.movieName, card.dataset.movieYear);
                else if (actionButton.classList.contains('delete-button')) handleDelete(card);
                return;
            }
            renderModal(card);
        });
    }

    if (closeButton) closeButton.addEventListener('click', closeModal);
    if (modalOverlay) modalOverlay.addEventListener('click', e => { if (e.target === modalOverlay) closeModal(); });

    if (widgetHeader) widgetHeader.addEventListener('click', () => widget.classList.toggle('minimized'));
    if (widgetToggleBtn) widgetToggleBtn.addEventListener('click', e => { e.stopPropagation(); widget.classList.toggle('minimized'); });

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