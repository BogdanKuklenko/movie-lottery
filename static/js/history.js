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

    // --- 1. Форматирование дат на постерах ---
    dateOverlays.forEach(overlay => {
        const isoDate = overlay.dataset.date;
        if (isoDate) {
            const date = new Date(isoDate);
            overlay.textContent = date.toLocaleDateString('ru-RU', {
                day: '2-digit', month: '2-digit', year: 'numeric'
            });
        }
    });

    // --- 2. Логика открытия модального окна ---
    const openModal = async (lotteryId) => {
        modalOverlay.style.display = 'flex';
        modalResultView.style.display = 'none';
        modalWaitView.style.display = 'none';
        modalWinnerInfo.innerHTML = '<div class="loader"></div>';
        modalLoserList.innerHTML = '';
        try {
            const response = await fetch(`/api/result/${lotteryId}`);
            const data = await response.json();
            if (data.error) throw new Error(data.error);
            if (data.result) {
                const winner = data.result;
                const losers = data.movies.filter(movie => movie.name !== winner.name);
                modalWinnerInfo.innerHTML = `<div class="result-card"><img src="${winner.poster || 'https://via.placeholder.com/200x300.png?text=No+Image'}" alt="Постер ${winner.name}"><h3>${winner.name}</h3><p>${winner.year}</p></div>`;
                modalLoserList.innerHTML = '';
                if (losers.length > 0) {
                    losers.forEach(loser => {
                        const li = document.createElement('li');
                        li.className = 'loser-item';
                        li.innerHTML = `<img class="loser-poster" src="${loser.poster || 'https://via.placeholder.com/40x60.png?text=?'}" alt="${loser.name}"><span class="loser-name">${loser.name}</span>`;
                        modalLoserList.appendChild(li);
                    });
                    modalLoserListContainer.style.display = 'block';
                } else {
                    modalLoserListContainer.style.display = 'none';
                }
                modalResultView.style.display = 'block';
            } else {
                const playUrl = data.play_url;
                modalPlayLink.value = playUrl;
                const text = encodeURIComponent('Привет! Предлагаю тебе определить, какой фильм мы посмотрим. Нажми на ссылку и испытай удачу!');
                const url = encodeURIComponent(playUrl);
                telegramShareBtn.href = `https://t.me/share/url?url=${url}&text=${text}`;
                modalWaitView.style.display = 'block';
            }
        } catch (error) {
            modalResultView.style.display = 'block';
            modalWinnerInfo.innerHTML = `<p class="error-message">Не удалось загрузить детали лотереи.</p>`;
            console.error(error);
        }
    };

    if (gallery) {
        gallery.addEventListener('click', (e) => {
            const galleryItem = e.target.closest('.gallery-item') || e.target.closest('.waiting-card');
            if (galleryItem) {
                const lotteryId = galleryItem.dataset.lotteryId;
                openModal(lotteryId);
            }
        });
    }

    // --- 3. ИСПРАВЛЕННАЯ Логика закрытия модального окна ---
    const closeModal = () => {
        modalOverlay.style.display = 'none';
    };

    closeButton.addEventListener('click', closeModal);

    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) {
            closeModal();
        }
    });
    
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modalOverlay.style.display !== 'none') {
            closeModal();
        }
    });

    // --- АВТОМАТИЧЕСКОЕ ОБНОВЛЕНИЕ СТАТУСА ---
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
        card.innerHTML = `
            <img src="${lotteryData.result.poster || 'https://via.placeholder.com/200x300.png?text=No+Image'}" alt="${lotteryData.result.name}">
            <div class="date-overlay" data-date="${lotteryData.createdAt}">
                ${new Date(lotteryData.createdAt).toLocaleDateString('ru-RU', {day: '2-digit', month: '2-digit', year: 'numeric'})}
            </div>
        `;
    };

    startHistoryPolling();
});