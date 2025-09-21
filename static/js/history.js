// static/js/history.js

document.addEventListener('DOMContentLoaded', () => {
    const gallery = document.querySelector('.history-gallery');
    const modalOverlay = document.getElementById('history-modal');
    const closeButton = document.querySelector('.close-button');
    const modalWinnerInfo = document.getElementById('modal-winner-info');
    const modalLoserListContainer = document.getElementById('modal-loser-list');
    
    const widget = document.getElementById('torrent-status-widget');
    const widgetHeader = widget.querySelector('.widget-header');
    const widgetMovieName = widget.querySelector('#widget-movie-name');
    const widgetProgressBar = widget.querySelector('#widget-progress-bar');
    const widgetProgressText = widget.querySelector('#widget-progress-text');
    const widgetSpeedText = widget.querySelector('#widget-speed-text');
    const widgetEtaText = widget.querySelector('#widget-eta-text');
    // --- НОВОЕ: Элементы для сидов и пиров ---
    const widgetPeersText = widget.querySelector('#widget-peers-text');
    let statusPollInterval = null;

    // --- ОБНОВЛЕННАЯ ЛОГИКА ВИДЖЕТА ---
    const showWidget = (movieName) => {
        widgetMovieName.textContent = `Загрузка: ${movieName}`;
        widgetProgressBar.style.width = '0%';
        widgetProgressText.textContent = '...';
        widgetSpeedText.textContent = '';
        widgetEtaText.textContent = '';
        widgetPeersText.textContent = '';
        widget.style.display = 'block';
        widget.classList.remove('minimized');
    };

    const updateWidget = (data) => {
        widgetMovieName.textContent = data.name;
        widgetProgressText.textContent = `${data.progress}%`;
        widgetProgressBar.style.width = `${data.progress}%`;
        widgetSpeedText.textContent = `${data.speed} МБ/с`;
        widgetEtaText.textContent = data.eta;
        // --- НОВОЕ: Отображение сидов и пиров ---
        widgetPeersText.textContent = `Сиды: ${data.seeds} / Пиры: ${data.peers}`;
    };

    if (widgetHeader) {
        widgetHeader.addEventListener('click', () => {
            widget.classList.toggle('minimized');
        });
    }

    const startTorrentStatusPolling = (lotteryId, movieName) => {
        if (statusPollInterval) clearInterval(statusPollInterval);
        showWidget(movieName);
        
        const poll = async () => {
            try {
                const response = await fetch(`/api/torrent-status/${lotteryId}`);
                const data = await response.json();

                if (data.status !== 'not_found' && data.status !== 'error') {
                    updateWidget(data);
                    if (data.status.includes('seeding') || data.status.includes('completed') || parseFloat(data.progress) >= 100) {
                        clearInterval(statusPollInterval);
                    }
                }
            } catch (error) {
                console.error("Ошибка при опросе статуса торрента:", error);
                clearInterval(statusPollInterval);
            }
        };
        poll();
        statusPollInterval = setInterval(poll, 3000);
    };

    // --- НОВАЯ ЛОГИКА ВЗАИМОДЕЙСТВИЯ ---

    const handleSearchClick = (movieName, movieYear) => {
        const query = encodeURIComponent(`${movieName} (${movieYear})`);
        const searchUrl = `https://rutracker.org/forum/tracker.php?nm=${query}`;
        window.open(searchUrl, '_blank');
    };

    const handleDownloadClick = async (kinopoiskId, movieName, lotteryId) => {
        showWidget(movieName);
        try {
            const response = await fetch(`/api/start-download/${kinopoiskId}`, { method: 'POST' });
            const data = await response.json();
            if (data.success) {
                startTorrentStatusPolling(lotteryId, movieName);
            } else {
                alert(`Ошибка: ${data.message}`);
                widget.style.display = 'none';
            }
        } catch (error) {
            console.error('Ошибка при запуске скачивания:', error);
            alert('Произошла критическая ошибка.');
            widget.style.display = 'none';
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
            if(data.success) {
                closeModal();
                location.reload(); // Перезагружаем страницу для обновления кнопок
            }
        } catch (error) {
            console.error('Ошибка при сохранении magnet-ссылки:', error);
            alert('Произошла критическая ошибка.');
        }
    };

    // --- ОБНОВЛЕННАЯ ЛОГИКА УДАЛЕНИЯ ---
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
                // ИЗМЕНЕНИЕ: Скрываем виджет и останавливаем опрос
                if (statusPollInterval) clearInterval(statusPollInterval);
                widget.style.display = 'none';
                setTimeout(() => cardElement.remove(), 500);
            }
        } catch (error) {
            console.error('Ошибка при удалении лотереи:', error);
            alert('Не удалось удалить лотерею.');
        }
    };
    
    // --- ОБНОВЛЕННАЯ ЛОГИКА МОДАЛЬНОГО ОКНА ---
    const openModal = async (lotteryId) => {
        modalOverlay.style.display = 'flex';
        modalWinnerInfo.innerHTML = '<div class="loader"></div>';
        modalLoserListContainer.style.display = 'none';

        try {
            const response = await fetch(`/api/result/${lotteryId}`);
            if (!response.ok) throw new Error('Ошибка сети');
            const data = await response.json();
            if (data.error) throw new Error(data.error);

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

                modalWinnerInfo.querySelector('.copy-btn').addEventListener('click', (e) => {
                    const targetId = e.target.dataset.target;
                    const input = document.getElementById(targetId);
                    input.select();
                    document.execCommand('copy');
                    e.target.textContent = 'Скопировано!';
                    setTimeout(() => { e.target.textContent = 'Копировать'; }, 2000);
                });
            }
        } catch (error) {
            modalWinnerInfo.innerHTML = `<p class="error-message">Не удалось загрузить детали: ${error.message}</p>`;
        }
    };
    
    const renderWinnerCard = (winner) => {
        const ratingClass = winner.rating_kp >= 7 ? 'rating-high' : winner.rating_kp >= 5 ? 'rating-medium' : 'rating-low';
        const ratingBadgeHtml = winner.rating_kp ? `<div class="rating-badge ${ratingClass}">${winner.rating_kp.toFixed(1)}</div>` : '';
        
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

        modalWinnerInfo.querySelector('.save-magnet-btn').addEventListener('click', () => {
            const input = modalWinnerInfo.querySelector('#magnet-input');
            handleSaveMagnet(winner.kinopoisk_id, input.value);
        });

        const deleteBtn = modalWinnerInfo.querySelector('.delete-magnet-btn');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', () => {
                if (confirm('Вы уверены, что хотите удалить сохраненную magnet-ссылку?')) {
                    handleSaveMagnet(winner.kinopoisk_id, ''); // Отправляем пустую строку для удаления
                }
            });
        }
    };

    // --- ОБНОВЛЕННЫЙ ОБРАБОТЧИК КЛИКОВ В ГАЛЕРЕЕ ---
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

    const closeModal = () => { if(modalOverlay) modalOverlay.style.display = 'none'; };
    if (closeButton) closeButton.addEventListener('click', closeModal);
    if (modalOverlay) modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) closeModal(); });
});