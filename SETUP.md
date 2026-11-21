# Дополнительные компоненты для Windows x64

Основная панель и ручные/тестовые донаты работают с установленным Node.js 24+. Остальные компоненты устанавливаются отдельно. Все пути ниже указаны относительно папки проекта. Не копируй папку `data/` от другого человека.

## HTTPS

Скачай Windows 64-bit `cloudflared.exe` по ссылке из [официальной инструкции](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/downloads/). Создай `runtime/` и помести файл в `runtime/cloudflared.exe`. Запусти `START-HTTPS.cmd`.

Проверенная версия: **2026.11.1**. SHA256 официального файла `cloudflared-windows-amd64.exe` этой версии:

```text
341deda3db5ec498a0482254d6c38c0b7cf01a30c37bb5dd95d2216d08955e35
```

Этот хеш относится только к указанной версии. Новые версии имеют другой хеш. Подробности режима и данных, передаваемых Cloudflare: `HTTPS.txt`.

## Казахская озвучка

1. Скачай `piper_windows_amd64.zip` из [релиза Piper 2023.11.14-2](https://github.com/rhasspy/piper/releases/tag/2023.11.14-2).
2. Распакуй весь комплект так, чтобы программа была по пути `runtime/piper/piper.exe`. Сохрани DLL и каталог `espeak-ng-data` рядом с ней.
3. Из [официального каталога Piper voices](https://huggingface.co/rhasspy/piper-voices/tree/main/kk/kk_KZ) скачай модели `iseke/x_low/kk_KZ-iseke-x_low.onnx` и `raya/x_low/kk_KZ-raya-x_low.onnx` в `voices/`. Соответствующие `.onnx.json` и карточки моделей уже есть в репозитории.
4. Создай папку `samples/`, затем выполни `node make-samples.mjs` для генерации примеров.
5. В панели открой «Озвучка», выбери голос, включи озвучивание и сохрани настройки.

Модели и компоненты сохраняют свои лицензии, см. `THIRD-PARTY.txt`. Русские и смешанные сообщения могут звучать с акцентом.

## Bluetooth-модуль iPhone

Нужны Windows с Bluetooth, Python **3.12 x64** и разрешение системных уведомлений на собственном iPhone. Сопряжение и разрешения подтверждаются пользователем.

В PowerShell из папки проекта:

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r phone/requirements-build.txt
.\.venv\Scripts\python.exe -m PyInstaller --noconfirm --clean --onedir --console --name iphone-bridge --collect-submodules winrt --paths phone --distpath runtime --workpath build/phone --specpath build phone/iphone_bridge.py
.\runtime\iphone-bridge\iphone-bridge.exe
```

Последняя команда только запускает помощник: он ожидает JSON-команду на stdin и не является графическим приложением. Для обычного использования запускай `START.cmd`, затем раздел «iPhone · Bluetooth». Можно не выполнять последнюю команду при установке.

Результат сборки должен находиться в `runtime/iphone-bridge/iphone-bridge.exe`; папка `_internal` рядом с ним обязательна.

Модуль читает новые подходящие уведомления Kaspi; это не банковский API. Без реального образца входящего уведомления автопоказ не включается. Если телефон скрывает сумму или сообщение, приложение их не восстановит. Подробная настройка: `НАЧНИ ЗДЕСЬ.txt`.

## Перенос существующей установки

Для собственного компьютера можно добавить в исходники уже установленные папки `runtime/`, `voices/` и `samples/` из своей локальной сборки. Они исключены из Git. Перенос личной `data/` — отдельная резервная копия, не отправляй её на GitHub.
