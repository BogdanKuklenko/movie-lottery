// static/js/library.js

document.addEventListener('DOMContentLoaded', () => {
    const grid = document.querySelector('.library-gallery');
    if (!grid) return;

    const modal = document.getElementById('library-modal');
    const modalBody = modal ? document.getElementById('library-modal-body') : null;
    const closeButton = modal ? modal.querySelector('.close-button') : null;
    const placeholderPoster = 'https://via.placeholder.com/200x300.png?text=No+Image';

    const setFeedback = (element, message, type = '') => {
        if (!element) return;
        element.textContent = message;
        element.classList.remove('is-error', 'is-success');
        if (type === 'error') {
            element.classList.add('is-error');
        } else if (type === 'success') {
            element.classList.add('is-success');
        }
    };

    const updateActionButton = (card) => {
        if (!card) return;
        const primaryBtn = card.querySelector('.library-primary-action');
        if (!primaryBtn) return;

        const hasMagnet = card.dataset.hasMagnet === 'true';
        primaryBtn.innerHTML = hasMagnet ? '&#x2913;' : '&#x1F50D;';
        primaryBtn.title = hasMagnet ? 'Скачать фильм' : 'Искать торрент';
        primaryBtn.classList.toggle('download-button', hasMagnet);
        primaryBtn.classList.toggle('search-button', !hasMagnet);
        card.classList.toggle('has-magnet', hasMagnet);
    };

    const closeModal = () => {
        if (!modal) return;
        modal.style.display = 'none';
        if (modalBody) {
            modalBody.innerHTML = '';
        }
        if (modal.dataset) {
            delete modal.dataset.activeId;
        }
        document.body.classList.remove('no-scroll');
    };

    const handleSearch = (card) => {
        if (!card) return;
        const name = card.dataset.movieName || '';
        const year = card.dataset.movieYear || '';
        const query = year ? `${name} (${year})` : name;
        if (!query.trim()) return;
        const url = `https://rutracker.org/forum/tracker.php?nm=${encodeURIComponent(query)}`;
        window.open(url, '_blank');
    };

    const handleDownload = async (card, triggerButton) => {
        if (!card) return;
        const kinopoiskId = card.dataset.kinopoiskId;
        if (!kinopoiskId) {
            alert('Для этого фильма нет сохранённого идентификатора Кинопоиска.');
            return;
        }

        if (triggerButton) {
            triggerButton.disabled = true;
            triggerButton.classList.add('is-busy');
        }

        try {
            const response = await fetch(`/api/start-download/${kinopoiskId}`, { method: 'POST' });
            const data = await response.json();
            if (!response.ok || !data.success) {
                throw new Error(data.message || 'Не удалось запустить скачивание.');
            }
            alert(data.message || 'Загрузка началась!');
        } catch (error) {
            console.error('Ошибка при запуске скачивания:', error);
            alert(error.message || 'Не удалось запустить скачивание.');
        } finally {
            if (triggerButton) {
                triggerButton.disabled = false;
                triggerButton.classList.remove('is-busy');
            }
        }
    };

    const handleRemoveCard = async (card) => {
        if (!card) return;
        const movieId = card.dataset.libraryId;
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

            card.classList.add('is-deleting');
            if (modal && modal.dataset.activeId === movieId) {
                closeModal();
            }

            setTimeout(() => {
                card.remove();
                if (!grid.querySelector('.gallery-item')) {
                    const emptyMessage = document.createElement('p');
                    emptyMessage.className = 'no-history';
                    emptyMessage.textContent = 'В библиотеке пока нет фильмов.';
                    grid.appendChild(emptyMessage);
                }
            }, 220);
        } catch (error) {
            console.error('Ошибка при удалении фильма из библиотеки:', error);
            alert(error.message || 'Не удалось удалить фильм из библиотеки.');
        }
    };

    const handleMagnetSave = async (card, controls) => {
        const { input, feedback, saveBtn, deleteBtn } = controls;
        if (!card || !input) return;
        const kinopoiskId = card.dataset.kinopoiskId;
        if (!kinopoiskId) {
            setFeedback(feedback, 'Для этого фильма недоступно сохранение magnet-ссылки.', 'error');
            return;
        }

        const magnetLink = (input.value || '').trim();
        if (!magnetLink) {
            setFeedback(feedback, 'Введите magnet-ссылку или используйте удаление.', 'error');
            return;
        }

        try {
            if (saveBtn) {
                saveBtn.disabled = true;
                saveBtn.textContent = 'Сохранение...';
            }
            setFeedback(feedback, '', '');
            const response = await fetch('/api/movie-magnet', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    kinopoisk_id: Number(kinopoiskId),
                    magnet_link: magnetLink,
                }),
            });
            const data = await response.json();
            if (!response.ok || !data.success) {
                throw new Error(data.message || 'Не удалось сохранить ссылку.');
            }

            card.dataset.hasMagnet = data.has_magnet ? 'true' : 'false';
            card.dataset.magnetLink = data.magnet_link || magnetLink;
            input.value = data.magnet_link || magnetLink;
            updateActionButton(card);
            if (deleteBtn) {
                deleteBtn.style.display = data.has_magnet ? '' : 'none';
            }
            setFeedback(feedback, data.message || 'Magnet-ссылка сохранена.', 'success');
        } catch (error) {
            console.error('Ошибка при сохранении magnet-ссылки:', error);
            setFeedback(feedback, error.message || 'Не удалось сохранить ссылку.', 'error');
        } finally {
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.textContent = 'Сохранить';
            }
        }
    };

    const handleMagnetDelete = async (card, controls) => {
        const { input, feedback, deleteBtn } = controls;
        if (!card) return;
        const kinopoiskId = card.dataset.kinopoiskId;
        if (!kinopoiskId) {
            setFeedback(feedback, 'Для этого фильма недоступно удаление magnet-ссылки.', 'error');
            return;
        }

        if (!confirm('Удалить сохранённую magnet-ссылку?')) {
            return;
        }

        try {
            if (deleteBtn) {
                deleteBtn.disabled = true;
            }
            setFeedback(feedback, '', '');
            const response = await fetch('/api/movie-magnet', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    kinopoisk_id: Number(kinopoiskId),
                    magnet_link: '',
                }),
            });
            const data = await response.json();
            if (!response.ok || !data.success) {
                throw new Error(data.message || 'Не удалось удалить ссылку.');
            }

            card.dataset.hasMagnet = 'false';
            card.dataset.magnetLink = '';
            if (input) {
                input.value = '';
                input.focus();
            }
            updateActionButton(card);
            if (deleteBtn) {
                deleteBtn.disabled = false;
                deleteBtn.style.display = 'none';
            }
            setFeedback(feedback, data.message || 'Magnet-ссылка удалена.', 'success');
        } catch (error) {
            console.error('Ошибка при удалении magnet-ссылки:', error);
            setFeedback(feedback, error.message || 'Не удалось удалить ссылку.', 'error');
            if (deleteBtn) {
                deleteBtn.disabled = false;
            }
        }
    };

    const openModal = (card) => {
        if (!modal || !modalBody || !card) return;
        modalBody.innerHTML = '';
        modal.dataset.activeId = card.dataset.libraryId || '';
        modal.style.display = 'flex';
        document.body.classList.add('no-scroll');

        const wrapper = document.createElement('div');
        wrapper.className = 'winner-card';

        const posterWrapper = document.createElement('div');
        posterWrapper.className = 'winner-poster';
        const posterImage = document.createElement('img');
        posterImage.src = card.dataset.moviePoster || placeholderPoster;
        posterImage.alt = `Постер ${card.dataset.movieName || ''}`;
        posterWrapper.appendChild(posterImage);

        const ratingValue = parseFloat(card.dataset.movieRating || '');
        if (!Number.isNaN(ratingValue) && ratingValue > 0) {
            const ratingBadge = document.createElement('div');
            let ratingClass = 'rating-low';
            if (ratingValue >= 7) ratingClass = 'rating-high';
            else if (ratingValue >= 5) ratingClass = 'rating-medium';
            ratingBadge.className = `rating-badge ${ratingClass}`;
            ratingBadge.textContent = ratingValue.toFixed(1);
            posterWrapper.appendChild(ratingBadge);
        }

        const details = document.createElement('div');
        details.className = 'winner-details';

        const titleEl = document.createElement('h2');
        const titleName = card.dataset.movieName || 'Неизвестный фильм';
        const titleYear = card.dataset.movieYear || '';
        titleEl.textContent = titleYear ? `${titleName} (${titleYear})` : titleName;
        details.appendChild(titleEl);

        const metaParts = [];
        if (card.dataset.movieGenres) metaParts.push(card.dataset.movieGenres);
        if (card.dataset.movieCountries) metaParts.push(card.dataset.movieCountries);
        if (metaParts.length) {
            const metaEl = document.createElement('p');
            metaEl.className = 'meta-info';
            metaEl.textContent = metaParts.join(' / ');
            details.appendChild(metaEl);
        }

        const descriptionEl = document.createElement('p');
        descriptionEl.className = 'description';
        descriptionEl.textContent = card.dataset.movieDescription || 'Описание отсутствует.';
        details.appendChild(descriptionEl);

        const kinopoiskId = card.dataset.kinopoiskId;
        if (kinopoiskId) {
            const magnetForm = document.createElement('div');
            magnetForm.className = 'magnet-form';

            const label = document.createElement('label');
            label.setAttribute('for', 'library-magnet-input');
            label.textContent = 'Magnet-ссылка:';
            magnetForm.appendChild(label);

            const input = document.createElement('input');
            input.type = 'text';
            input.id = 'library-magnet-input';
            input.value = card.dataset.magnetLink || '';
            input.placeholder = 'Вставьте magnet-ссылку...';
            magnetForm.appendChild(input);

            const actions = document.createElement('div');
            actions.className = 'magnet-actions';

            const saveBtn = document.createElement('button');
            saveBtn.type = 'button';
            saveBtn.className = 'secondary-button save-magnet-btn';
            saveBtn.textContent = 'Сохранить';
            actions.appendChild(saveBtn);

            const deleteBtn = document.createElement('button');
            deleteBtn.type = 'button';
            deleteBtn.className = 'delete-magnet-btn';
            deleteBtn.textContent = 'Удалить ссылку';
            if (card.dataset.hasMagnet !== 'true') {
                deleteBtn.style.display = 'none';
            }
            actions.appendChild(deleteBtn);

            magnetForm.appendChild(actions);

            const feedback = document.createElement('p');
            feedback.className = 'magnet-feedback';
            magnetForm.appendChild(feedback);

            details.appendChild(magnetForm);

            const controls = { input, feedback, saveBtn, deleteBtn };

            saveBtn.addEventListener('click', () => handleMagnetSave(card, controls));
            deleteBtn.addEventListener('click', () => handleMagnetDelete(card, controls));
            input.addEventListener('keydown', (evt) => {
                if (evt.key === 'Enter') {
                    evt.preventDefault();
                    handleMagnetSave(card, controls);
                }
            });

            setTimeout(() => input.focus(), 120);
        } else {
            const warning = document.createElement('p');
            warning.className = 'magnet-unavailable';
            warning.textContent = 'Для этого фильма не удалось определить ID на Кинопоиске, поэтому magnet-ссылку сохранить нельзя.';
            details.appendChild(warning);
        }

        wrapper.appendChild(posterWrapper);
        wrapper.appendChild(details);
        modalBody.appendChild(wrapper);
    };

    grid.querySelectorAll('.gallery-item').forEach((card) => updateActionButton(card));

    grid.addEventListener('click', (event) => {
        const removeBtn = event.target.closest('.library-remove-btn');
        if (removeBtn) {
            event.preventDefault();
            event.stopPropagation();
            const card = removeBtn.closest('.gallery-item');
            handleRemoveCard(card);
            return;
        }

        const primaryBtn = event.target.closest('.library-primary-action');
        if (primaryBtn) {
            event.preventDefault();
            event.stopPropagation();
            const card = primaryBtn.closest('.gallery-item');
            if (!card) return;
            if (card.dataset.hasMagnet === 'true') {
                handleDownload(card, primaryBtn);
            } else {
                handleSearch(card);
            }
            return;
        }

        const card = event.target.closest('.gallery-item');
        if (!card) return;
        event.preventDefault();
        openModal(card);
    });

    if (closeButton) {
        closeButton.addEventListener('click', closeModal);
    }

    if (modal) {
        modal.addEventListener('click', (event) => {
            if (event.target === modal) {
                closeModal();
            }
        });
    }

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && modal && modal.style.display === 'flex') {
            closeModal();
        }
    });
});
