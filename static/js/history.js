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
                lotteryId: entry.lotteryId,
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
        if (!widget || !lotteryId) return null;
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

        const progressValue = Number.parseFloat(data.progress) || 0;
        if (bar) bar.style.width = `${Math.min(100, Math.max(0, progressValue))}%`;
        if (progressText) progressText.textContent = `${progressValue.toFixed(0)}%`;
        if (speedText) speedText.textContent = data.speed ? `${data.speed} МБ/с` : '0.00 МБ/с';
        if (etaText) etaText.textContent = data.eta || '--:--';
        if (peersText) peersText.textContent = `Сиды: ${data.seeds ?? 0} / Пиры: ${data.peers ?? 0}`;
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

    const startTorrentStatusPolling = (lotteryId, movieName, kinopoiskId, { skipRegister = false } = {}) => {
        if (!lotteryId) return;
        if (!skipRegister) {
            registerDownload(lotteryId, movieName, kinopoiskId);
        }

        if (pollIntervals.has(lotteryId)) {
            clearInterval(pollIntervals.get(lotteryId));
        }

        const poll = async () => {
            try {
                const response = await fetch(`/api/torrent-status/${lotteryId}`);
                if (!response.ok) {
                    throw new Error('Сервер вернул ошибку статуса');
                }
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

                const progressValue = Number.parseFloat(data.progress) || 0;
                const statusText = (data.status || '').toLowerCase();
                const isCompleted = progressValue >= 100 || statusText.includes('seeding') || statusText.includes('completed');

                if (isCompleted) {
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
        const stored = loadStoredDownloads();
        stored.forEach((entry) => {
            if (!entry || !entry.lotteryId) return;
            startTorrentStatusPolling(entry.lotteryId, entry.movieName, entry.kinopoiskId);
        });
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

    const refreshCardActions = (lotteryId, winner) => {
        if (!gallery) return;
        const card = gallery.querySelector(`.gallery-item[data-lottery-id="${lotteryId}"]`);
        if (!card) return;

        if (winner) {
            card.dataset.kinopoiskId = winner.kinopoisk_id || '';
            card.dataset.movieName = winner.name || '';
            card.dataset.movieYear = winner.year || '';
            card.dataset.moviePoster = winner.poster || '';
            card.dataset.movieDescription = winner.description || '';
            card.dataset.movieRating = winner.rating_kp != null ? winner.rating_kp : '';
            card.dataset.movieGenres = winner.genres || '';
            card.dataset.movieCountries = winner.countries || '';
        }

        const buttons = card.querySelector('.action-buttons');
        if (!buttons) return;

        const existingDownloadBtn = buttons.querySelector('.download-button');
        const existingSearchBtn = buttons.querySelector('.search-button');

        if (winner && winner.has_magnet) {
            if (existingSearchBtn) {
                const downloadBtn = document.createElement('button');
                downloadBtn.className = 'action-button download-button';
                downloadBtn.title = 'Скачать фильм';
                downloadBtn.innerHTML = '&#x2913;';
                buttons.replaceChild(downloadBtn, existingSearchBtn);
            } else if (!existingDownloadBtn) {
                const downloadBtn = document.createElement('button');
                downloadBtn.className = 'action-button download-button';
                downloadBtn.title = 'Скачать фильм';
                downloadBtn.innerHTML = '&#x2913;';
                buttons.insertBefore(downloadBtn, buttons.firstChild);
            }
        } else {
            if (existingDownloadBtn) {
                const searchBtn = document.createElement('button');
                searchBtn.className = 'action-button search-button';
                searchBtn.title = 'Искать торрент';
                searchBtn.innerHTML = '&#x1F50D;';
                buttons.replaceChild(searchBtn, existingDownloadBtn);
            } else if (!existingSearchBtn) {
                const searchBtn = document.createElement('button');
                searchBtn.className = 'action-button search-button';
                searchBtn.title = 'Искать торрент';
                searchBtn.innerHTML = '&#x1F50D;';
                buttons.insertBefore(searchBtn, buttons.firstChild);
            }
        }
    };

    const copyToClipboard = async (value, feedbackTarget) => {
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(value);
            } else {
                const tempInput = document.createElement('input');
                tempInput.value = value;
                document.body.appendChild(tempInput);
                tempInput.select();
                document.execCommand('copy');
                document.body.removeChild(tempInput);
            }
            if (feedbackTarget) {
                const original = feedbackTarget.textContent;
                feedbackTarget.textContent = 'Скопировано!';
                setTimeout(() => {
                    feedbackTarget.textContent = original;
                }, 2000);
            }
        } catch (error) {
            console.error('Не удалось скопировать ссылку:', error);
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
            if (!response.ok || !data.success) {
                throw new Error(data.message || 'Не удалось добавить фильм.');
            }
            alert(data.message || 'Фильм добавлен в библиотеку.');
        } catch (error) {
            alert(error.message);
        }
    };

    const buildLibraryPayloadFromCard = (card) => {
        if (!card) return null;
        return {
            lottery_id: card.dataset.lotteryId || null,
            kinopoisk_id: card.dataset.kinopoiskId || null,
            name: card.dataset.movieName || '',
            year: card.dataset.movieYear || '',
            poster: card.dataset.moviePoster || '',
            description: card.dataset.movieDescription || '',
            rating_kp: card.dataset.movieRating || '',
            genres: card.dataset.movieGenres || '',
            countries: card.dataset.movieCountries || '',
        };
    };

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
                <img class="participant-poster" src="${escapeAttr(movie.poster || placeholderPoster)}" alt="${escapeHtml(movie.name)}">
                <span class="participant-name">${escapeHtml(movie.name)}</span>
                <span class="participant-meta">${escapeHtml(movie.year || '')}</span>
                ${movie.name === winnerName ? '<span class="participant-winner-badge">Победитель</span>' : ''}
            `;

            modalParticipantsList.appendChild(item);
        });
    };

    const renderWaitingState = (data) => {
        if (!modalWinnerInfo) return;
        const playUrl = data.play_url;
        const text = encodeURIComponent('Привет! Предлагаю тебе определить, какой фильм мы посмотрим. Нажми на ссылку и испытай удачу!');
        const url = encodeURIComponent(playUrl);
        const telegramHref = `https://t.me/share/url?url=${url}&text=${text}`;

        modalWinnerInfo.innerHTML = `
            <h3>Лотерея ожидает розыгрыша</h3>
            <p>Поделитесь ссылкой с другом, чтобы он мог выбрать фильм.</p>
            <div class="link-box">
                <label for="play-link-modal">Ссылка для друга:</label>
                <input type="text" id="play-link-modal" value="${escapeAttr(playUrl)}" readonly>
                <button class="copy-btn" data-target="play-link-modal">Копировать</button>
            </div>
            <a href="${telegramHref}" class="action-button-tg" target="_blank" rel="noopener noreferrer">
                Поделиться в Telegram
            </a>
        `;

        const copyBtn = modalWinnerInfo.querySelector('.copy-btn');
        if (copyBtn) {
            copyBtn.addEventListener('click', (event) => {
                const targetId = event.currentTarget.dataset.target;
                const input = document.getElementById(targetId);
                if (input) {
                    copyToClipboard(input.value, event.currentTarget);
                }
            });
        }
    };

    const handleSaveMagnet = async (lotteryId, kinopoiskId, magnetLink) => {
        if (!kinopoiskId) {
            alert('Не удалось определить ID фильма для сохранения magnet-ссылки.');
            return;
        }
        try {
            const response = await fetch('/api/movie-magnet', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ kinopoisk_id: kinopoiskId, magnet_link: magnetLink }),
            });
            const data = await response.json();
            alert(data.message);
            if (!response.ok || !data.success) {
                return;
            }
            const refreshed = await fetchLotteryDetails(lotteryId);
            renderLotteryDetails(refreshed);
            if (refreshed.result) {
                refreshCardActions(lotteryId, refreshed.result);
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
            if (response.ok && data.success) {
                cardElement.classList.add('is-deleting');
                removeDownload(lotteryId);
                setTimeout(() => {
                    cardElement.remove();
                    formatDateBadges();
                }, 300);
            }
        } catch (error) {
            console.error('Ошибка при удалении лотереи:', error);
            alert('Не удалось удалить лотерею.');
        }
    };

    const renderWinnerCard = (winner) => {
        if (!modalWinnerInfo) return;

        const ratingValue = Number.parseFloat(winner.rating_kp);
        let ratingBadgeHtml = '';
        if (!Number.isNaN(ratingValue)) {
            const ratingClass = ratingValue >= 7 ? 'rating-high' : ratingValue >= 5 ? 'rating-medium' : 'rating-low';
            ratingBadgeHtml = `<div class="rating-badge ${ratingClass}">${ratingValue.toFixed(1)}</div>`;
        }

        modalWinnerInfo.innerHTML = `
            <div class="winner-card">
                <div class="winner-poster">
                    <img src="${escapeAttr(winner.poster || placeholderPoster)}" alt="Постер ${escapeHtml(winner.name)}">
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
            </div>
        `;

        const saveBtn = modalWinnerInfo.querySelector('.save-magnet-btn');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => {
                const input = modalWinnerInfo.querySelector('#magnet-input');
                handleSaveMagnet(currentModalLotteryId, winner.kinopoisk_id, input ? input.value.trim() : '');
            });
        }

        const deleteBtn = modalWinnerInfo.querySelector('.delete-magnet-btn');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', () => {
                if (confirm('Вы уверены, что хотите удалить сохраненную magnet-ссылку?')) {
                    handleSaveMagnet(currentModalLotteryId, winner.kinopoisk_id, '');
                }
            });
        }

        const addToLibraryBtn = modalWinnerInfo.querySelector('.add-library-modal-btn');
        if (addToLibraryBtn) {
            addToLibraryBtn.addEventListener('click', () => {
                addMovieToLibrary({
                    lottery_id: currentModalLotteryId,
                    kinopoisk_id: winner.kinopoisk_id || null,
                    name: winner.name,
                    year: winner.year,
                    poster: winner.poster,
                    description: winner.description,
                    rating_kp: winner.rating_kp,
                    genres: winner.genres,
                    countries: winner.countries,
                });
            });
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
            renderWaitingState(data);
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
            if (data.result) {
                refreshCardActions(lotteryId, data.result);
            }
        } catch (error) {
            modalWinnerInfo.innerHTML = `<p class="error-message">Не удалось загрузить детали: ${escapeHtml(error.message)}</p>`;
        }
    };

    const handleSearchClick = (movieName, movieYear) => {
        if (!movieName) return;
        const parts = [movieName.trim()];
        if (movieYear && movieYear.trim()) {
            parts.push(`(${movieYear.trim()})`);
        }
        const query = encodeURIComponent(parts.join(' '));
        window.open(`https://rutracker.org/forum/tracker.php?nm=${query}`, '_blank');
    };

    const handleDownloadClick = async (kinopoiskId, movieName, lotteryId) => {
        if (!kinopoiskId) {
            alert('Сначала добавьте magnet-ссылку для этого фильма.');
            openModal(lotteryId);
            return;
        }
        registerDownload(lotteryId, movieName, kinopoiskId);
        try {
            const response = await fetch(`/api/start-download/${kinopoiskId}`, { method: 'POST' });
            const data = await response.json();
            if (data.success) {
                startTorrentStatusPolling(lotteryId, movieName, kinopoiskId, { skipRegister: true });
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

        const actionButtonHtml = winner.has_magnet
            ? '<button class="action-button download-button" title="Скачать фильм">&#x2913;</button>'
            : '<button class="action-button search-button" title="Искать торрент">&#x1F50D;</button>';

        item.innerHTML = `
            <div class="action-buttons">
                ${actionButtonHtml}
                <button class="action-button library-button" title="Добавить в библиотеку">&#128218;</button>
                <button class="action-button-delete delete-button" title="Удалить лотерею">&times;</button>
            </div>
            <div class="date-badge" data-date="${escapeAttr(createdAtIso)}"></div>
            <img src="${escapeAttr(winner.poster || placeholderPoster)}" alt="${escapeHtml(winner.name)}">
        `;

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
                    refreshCardActions(lotteryId, data.result);
                    map.delete(lotteryId);
                    formatDateBadges();
                } else if (modalOverlay && modalOverlay.style.display === 'flex' && currentModalLotteryId === lotteryId) {
                    renderWaitingState(data);
                }
            } catch (error) {
                console.error('Не удалось обновить лотерею', lotteryId, error);
            }
        });

        await Promise.all(tasks);
    };

    if (gallery) {
        gallery.addEventListener('click', (event) => {
            const galleryItem = event.target.closest('.gallery-item');
            if (!galleryItem) return;

            const { lotteryId, kinopoiskId, movieName, movieYear } = galleryItem.dataset;
            const isDownloadButton = event.target.classList.contains('download-button');
            const isSearchButton = event.target.classList.contains('search-button');
            const isDeleteButton = event.target.classList.contains('delete-button');
            const isLibraryButton = event.target.classList.contains('library-button');

            if (isDownloadButton) {
                event.stopPropagation();
                handleDownloadClick(kinopoiskId, movieName, lotteryId);
                return;
            }

            if (isSearchButton) {
                event.stopPropagation();
                handleSearchClick(movieName, movieYear);
                return;
            }

            if (isDeleteButton) {
                event.stopPropagation();
                handleDeleteLottery(lotteryId, galleryItem);
                return;
            }

            if (isLibraryButton) {
                event.stopPropagation();
                addMovieToLibrary(buildLibraryPayloadFromCard(galleryItem));
                return;
            }

            openModal(lotteryId);
        });
    }

    const closeModal = () => {
        if (modalOverlay) {
            modalOverlay.style.display = 'none';
        }
    };

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

    const waitingCards = new Map();
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
    formatDateBadges();
});
