// static/js/library.js

document.addEventListener('DOMContentLoaded', () => {
    const gallery = document.querySelector('.library-gallery');
    const modalOverlay = document.getElementById('library-modal');
    const modalBody = document.getElementById('library-modal-body');
    const closeButton = modalOverlay ? modalOverlay.querySelector('.close-button') : null;
    const emptyMessage = document.querySelector('.library-empty-message');
    const placeholderPoster = 'https://via.placeholder.com/200x300.png?text=No+Image';

    const formatDateBadges = () => {
        if (!gallery) return;
        const formatter = new Intl.DateTimeFormat('ru-RU', {
            day: '2-digit',
            month: 'long',
            year: 'numeric',
        });

        gallery.querySelectorAll('.date-badge').forEach((badge) => {
            const iso = badge.dataset.date;
            if (!iso) return;

            const date = new Date(iso);
            if (Number.isNaN(date.getTime())) return;

            badge.innerHTML = `<span class="calendar-icon">&#x1F4C5;</span>${formatter.format(date)}`;
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
        } = card.dataset;

        const ratingValue = parseFloat(movieRating);
        let ratingBadge = '';
        if (!Number.isNaN(ratingValue)) {
            const ratingClass = ratingValue >= 7 ? 'rating-high' : ratingValue >= 5 ? 'rating-medium' : 'rating-low';
            ratingBadge = `<div class="rating-badge ${ratingClass}">${ratingValue.toFixed(1)}</div>`;
        }

        modalBody.innerHTML = `
            <div class="winner-card">
                <div class="winner-poster">
                    <img src="${moviePoster || placeholderPoster}" alt="Постер ${movieName}">
                    ${ratingBadge}
                </div>
                <div class="winner-details">
                    <h2>${movieName}${movieYear ? ` (${movieYear})` : ''}</h2>
                    <p class="meta-info">${movieGenres || 'н/д'} / ${movieCountries || 'н/д'}</p>
                    <p class="description">${movieDescription || 'Описание отсутствует.'}</p>
                    <div class="library-modal-actions">
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

        modalOverlay.style.display = 'flex';
        document.body.classList.add('no-scroll');
    };

    if (gallery) {
        gallery.addEventListener('click', (event) => {
            const card = event.target.closest('.gallery-item');
            if (!card) return;

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

    formatDateBadges();
    ensureEmptyState();
});
