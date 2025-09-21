import sys
import os
import time

try:
    from torrentp import TorrentDownloader
    print("✅ УСПЕХ: Библиотека 'torrentp' успешно импортирована.")
except ImportError:
    print("❌ ОШИКА: Не удалось импортировать 'torrentp'.")
    sys.exit(1)

SEARCH_QUERY = "Inception 2010"
TEMP_PATH = "./temp_torrents"

print(f"\n[1] Начинаю финальную диагностику для: '{SEARCH_QUERY}'")
print("-" * 40)

if not os.path.exists(TEMP_PATH):
    os.makedirs(TEMP_PATH)

try:
    print("[2] Создаю объект TorrentDownloader (поиск может занять время)...")
    downloader = TorrentDownloader(SEARCH_QUERY, TEMP_PATH)
    # Дадим ему несколько секунд на поиск и загрузку метаданных
    print("    ...ожидаю 5 секунд для получения метаданных...")
    time.sleep(5)
    print("✅ УСПЕХ: Объект создан.")

    print("\n[3] Пытаюсь получить доступ к '_torrent_info'...")
    if hasattr(downloader, '_torrent_info') and downloader._torrent_info:
        torrent_info = downloader._torrent_info
        print("✅ УСПЕХ: Доступ к '_torrent_info' получен.")

        print("\n--- СВОЙСТВА И МЕТОДЫ ОБЪЕКТА '_torrent_info' ---")
        attributes = dir(torrent_info)
        for attr in attributes:
            if not attr.startswith('__'):
                print(f"  - {attr}")
        print("-" * 40)
        
        print("\n--- ДОПОЛНИТЕЛЬНАЯ ИНФОРМАЦИЯ ---")
        # Попробуем получить имя и хэш, это стандартные методы
        if hasattr(torrent_info, 'name'):
             print(f"  - Имя торрента (из info): {torrent_info.name()}")
        if hasattr(torrent_info, 'info_hash'):
             print(f"  - Инфо-хэш: {torrent_info.info_hash()}")
        print("-" * 40)

    else:
        print("🟡 ПРЕДУПРЕЖДЕНИЕ: Атрибут '_torrent_info' не найден или пуст.")
        
    print("\n[4] Диагностика завершена. Пожалуйста, отправьте весь этот вывод.")

except Exception as e:
    print(f"\n❌ КРИТИЧЕСКАЯ ОШИБКА: В процессе диагностики возникло исключение.")
    print(f"   Тип ошибки: {type(e).__name__}")
    print(f"   Детали: {e}")
    print("-" * 40)