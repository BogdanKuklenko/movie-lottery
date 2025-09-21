// static/js/library.js

document.addEventListener('DOMContentLoaded', () => {
    const grid = document.querySelector('.library-grid');
    if (!grid) return;

    grid.addEventListener('click', async (event) => {
        const removeBtn = event.target.closest('.library-remove-btn');
        if (!removeBtn) return;

        event.stopPropagation();
        const card = removeBtn.closest('.library-card');
        const movieId = card ? card.dataset.movieId : null;
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
            setTimeout(() => {
                card.remove();
                if (!grid.querySelector('.library-card')) {
                    const empty = document.createElement('p');
                    empty.className = 'no-history';
                    empty.textContent = 'В библиотеке пока нет фильмов.';
                    grid.appendChild(empty);
                }
            }, 200);
        } catch (error) {
            alert(error.message);
        }
    });
});
