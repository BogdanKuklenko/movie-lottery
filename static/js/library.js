// static/js/library.js

document.addEventListener('DOMContentLoaded', () => {

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

        }
    });
});
