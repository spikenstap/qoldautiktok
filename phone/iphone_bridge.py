"""Windows Bluetooth discovery, consent-based pairing and Kaspi-only ANCS reader.
Input: one JSON command on stdin. Output: JSON lines. No HTTP, cloud or notification actions.
"""
import asyncio
import json
import sys
import uuid
import os
import threading
from ancs_protocol import ANCS, SOURCE, CONTROL, DATA, KASPI, source_event, request, Response

def emit(kind, **fields):
    print(json.dumps(dict(type=kind, **fields), ensure_ascii=False), flush=True)

async def radios(enable=False):
    from winrt.windows.devices.radios import Radio, RadioKind, RadioState, RadioAccessStatus
    items = [r for r in await Radio.get_radios_async() if r.kind == RadioKind.BLUETOOTH]
    if not items:
        raise RuntimeError('Windows не обнаружила Bluetooth-адаптер.')
    if enable and any(r.state != RadioState.ON for r in items):
        access = await Radio.request_access_async()
        if access != RadioAccessStatus.ALLOWED:
            raise RuntimeError('Windows не разрешила включение Bluetooth из приложения. Включи его в параметрах Windows.')
        for radio in items:
            if radio.state != RadioState.ON:
                result = await radio.set_state_async(RadioState.ON)
                if result != RadioAccessStatus.ALLOWED:
                    raise RuntimeError('Bluetooth заблокирован системой или выключателем адаптера.')
        await asyncio.sleep(1)
    return [dict(name=r.name, on=r.state == RadioState.ON) for r in items]

async def scan():
    from winrt.windows.devices.bluetooth import BluetoothLEDevice
    from winrt.windows.devices.enumeration import DeviceInformation, DeviceInformationKind
    state = await radios()
    paired = await DeviceInformation.find_all_async(BluetoothLEDevice.get_device_selector_from_pairing_state(True), [])
    items = [dict(id=d.id, name=d.name or 'Bluetooth LE', paired=True, listen=True) for d in paired]
    emit('devices', radios=state, devices=items)
    # AEP discovery finds both Bluetooth Classic and LE devices available for pairing.
    selector = '(System.Devices.Aep.ProtocolId:="{e0cbf06c-cd8b-4647-bb8a-263b43f0f974}") OR (System.Devices.Aep.ProtocolId:="{bb7bb05e-5972-42b5-94fc-76eaa7084d49}")'
    found = await DeviceInformation.find_all_async(selector, [], DeviceInformationKind.ASSOCIATION_ENDPOINT)
    known = {d['id'] for d in items}
    items.extend(dict(id=d.id, name=d.name, paired=d.pairing.is_paired, listen=False) for d in found if d.name and d.id not in known)
    emit('devices', radios=state, devices=items)

async def pair(device_id):
    from winrt.windows.devices.enumeration import DeviceInformation, DeviceInformationKind, DevicePairingResultStatus
    info = await DeviceInformation.create_from_id_async(device_id, [], DeviceInformationKind.ASSOCIATION_ENDPOINT)
    if not info:
        raise RuntimeError('Устройство больше не найдено. Повтори поиск.')
    if info.pairing.is_paired:
        emit('paired', name=info.name, status='already_paired')
        return
    emit('status', message='Запрос отправлен выбранному устройству. Подтверди одинаковый код в Windows и на iPhone.')
    result = await info.pairing.pair_async()
    if result.status not in (DevicePairingResultStatus.PAIRED, DevicePairingResultStatus.ALREADY_PAIRED):
        raise RuntimeError('Сопряжение не завершено: ' + result.status.name + '. Открой Настройки → Bluetooth на iPhone и повтори.')
    emit('paired', name=info.name, status=result.status.name)

async def listen_once(device_id):
    from winrt.windows.devices.bluetooth import BluetoothLEDevice, BluetoothCacheMode, BluetoothConnectionStatus
    from winrt.windows.devices.bluetooth.genericattributeprofile import GattCommunicationStatus, GattClientCharacteristicConfigurationDescriptorValue, GattWriteOption, GattSession
    from winrt.windows.storage.streams import DataReader, DataWriter
    loop = asyncio.get_running_loop()
    device = await asyncio.wait_for(BluetoothLEDevice.from_id_async(device_id), 15)
    if device is None:
        raise RuntimeError('Не удалось открыть iPhone. Повтори поиск после сопряжения.')
    service = None
    session = None
    tokens = []
    current = None
    queue = asyncio.Queue(maxsize=100)
    fresh = set()
    def bytes_from(args):
        reader = DataReader.from_buffer(args.characteristic_value)
        out = bytearray(reader.unconsumed_buffer_length)
        reader.read_bytes(out)
        reader.close()
        return bytes(out)
    def consume_source(raw):
        item = source_event(raw)
        if not item or item['preexisting'] or item['event'] == 2:
            return
        if item['event'] == 0:
            fresh.add(item['uid'])
        if item['uid'] in fresh and not queue.full():
            queue.put_nowait(item['uid'])
    def consume_data(raw):
        if current and not current[1].done():
            try:
                result = current[0].feed(raw)
                if result is not None:
                    current[1].set_result(result)
            except ValueError as exc:
                current[1].set_exception(exc)
    def source_handler(sender, args):
        loop.call_soon_threadsafe(consume_source, bytes_from(args))
    def data_handler(sender, args):
        loop.call_soon_threadsafe(consume_data, bytes_from(args))
    try:
        session = await asyncio.wait_for(GattSession.from_device_id_async(device.bluetooth_device_id), 10)
        if session.can_maintain_connection:
            session.maintain_connection = True
            for _ in range(10):
                if device.connection_status == BluetoothConnectionStatus.CONNECTED:
                    break
                await asyncio.sleep(1)
        services = await asyncio.wait_for(device.get_gatt_services_for_uuid_async(uuid.UUID(ANCS), BluetoothCacheMode.UNCACHED), 25)
        if services.status.name == 'UNREACHABLE':
            raise RuntimeError('iPhone недоступен по Bluetooth. Держи его рядом, включи Bluetooth и открой Настройки → Bluetooth на телефоне.')
        if services.status.name == 'ACCESS_DENIED':
            raise RuntimeError('Нет доступа к уведомлениям iPhone. Разреши системные уведомления: Настройки → Bluetooth → ⓘ возле компьютера.')
        if services.status != GattCommunicationStatus.SUCCESS or not services.services:
            raise RuntimeError('iPhone не открыл сервис уведомлений ANCS. На iPhone: Настройки → Bluetooth → ⓘ возле ПК → Системные уведомления. Если мешает «Связь с телефоном», закрой его и повтори.')
        service = services.services[0]
        result = await asyncio.wait_for(service.get_characteristics_async(BluetoothCacheMode.UNCACHED), 15)
        if result.status != GattCommunicationStatus.SUCCESS:
            raise RuntimeError('Не удалось прочитать сервис уведомлений iPhone.')
        chars = {str(c.uuid).lower(): c for c in result.characteristics}
        if not all(x in chars for x in (SOURCE, CONTROL, DATA)):
            raise RuntimeError('iPhone не предоставил все характеристики ANCS.')
        for characteristic, handler in ((chars[DATA], data_handler), (chars[SOURCE], source_handler)):
            token = characteristic.add_value_changed(handler)
            tokens.append((characteristic, token))
            result = await asyncio.wait_for(characteristic.write_client_characteristic_configuration_descriptor_async(GattClientCharacteristicConfigurationDescriptorValue.NOTIFY), 15)
            if result != GattCommunicationStatus.SUCCESS:
                raise RuntimeError('iPhone не разрешил передачу уведомлений. Проверь разрешение на телефоне.')
        emit('connected', name=device.name)
        async def attributes(uid, attrs):
            nonlocal current
            future = loop.create_future()
            current = (Response(uid, attrs), future)
            writer = DataWriter()
            writer.write_bytes(request(uid, attrs))
            buffer = writer.detach_buffer()
            result = await asyncio.wait_for(chars[CONTROL].write_value_with_result_async(buffer, GattWriteOption.WRITE_WITH_RESPONSE), 10)
            writer.close()
            if result.status != GattCommunicationStatus.SUCCESS:
                raise RuntimeError('iPhone отклонил чтение уведомления.')
            try:
                return await asyncio.wait_for(future, 5)
            finally:
                current = None
        while device.connection_status == BluetoothConnectionStatus.CONNECTED:
            try:
                uid = await asyncio.wait_for(queue.get(), 2)
            except asyncio.TimeoutError:
                continue
            app = await attributes(uid, [0])
            # Other apps' titles/messages are never requested, logged or forwarded.
            if app.get(0) != KASPI:
                fresh.discard(uid)
                continue
            attrs = await attributes(uid, [1, 2, 3, 5])
            emit('notification', app=KASPI, uid=uid, title=attrs.get(1, ''), subtitle=attrs.get(2, ''), message=attrs.get(3, ''), date=attrs.get(5, ''))
        raise RuntimeError('Bluetooth-соединение с iPhone прервано.')
    finally:
        for characteristic, token in tokens:
            characteristic.remove_value_changed(token)
        if service:
            service.close()
        if session:
            session.maintain_connection = False
            session.close()
        device.close()

async def main(command):
    action = command.get('action')
    if action == 'scan':
        await asyncio.wait_for(scan(), 35)
    elif action == 'enable':
        emit('radios', radios=await asyncio.wait_for(radios(True), 20))
    elif action == 'pair':
        await asyncio.wait_for(pair(command['id']), 90)
    elif action == 'listen':
        last_error = ''
        for attempt in range(8):
            try:
                await listen_once(command['id'])
            except Exception as exc:
                last_error = str(exc) or ('iPhone не ответил вовремя.' if isinstance(exc,TimeoutError) else type(exc).__name__)
                emit('status', connected=False, message=last_error + f' Попытка {attempt+1} из 8.')
                await asyncio.sleep(min(3 * (attempt + 1), 20))
        raise RuntimeError(last_error + ' Повторные попытки завершены. Нажми «Подключить» после проверки телефона.')
    elif action == 'selftest':
        from winrt.windows.devices.bluetooth import BluetoothLEDevice, BluetoothCacheMode, BluetoothConnectionStatus
        from winrt.windows.devices.enumeration import DeviceInformation, DeviceInformationKind, DevicePairingResultStatus
        from winrt.windows.devices.bluetooth.genericattributeprofile import GattCommunicationStatus, GattClientCharacteristicConfigurationDescriptorValue, GattWriteOption
        from winrt.windows.storage.streams import DataReader, DataWriter
        from winrt.windows.devices.radios import Radio, RadioKind, RadioState, RadioAccessStatus
        writer=DataWriter();writer.write_bytes(b'ANCS');buffer=writer.detach_buffer()
        reader=DataReader.from_buffer(buffer);value=bytearray(4);reader.read_bytes(value)
        reader.close();writer.close()
        if bytes(value)!=b'ANCS':raise RuntimeError('WinRT buffer self-test failed')
        emit('selftest', ok=True)
    else:
        raise ValueError('Unknown action')

def watch_parent(pid):
    # Closing the application's console must also close its notification reader.
    import ctypes
    kernel=ctypes.WinDLL('kernel32', use_last_error=True)
    kernel.OpenProcess.argtypes=[ctypes.c_ulong,ctypes.c_int,ctypes.c_ulong]
    kernel.OpenProcess.restype=ctypes.c_void_p
    kernel.WaitForSingleObject.argtypes=[ctypes.c_void_p,ctypes.c_ulong]
    kernel.CloseHandle.argtypes=[ctypes.c_void_p]
    handle=kernel.OpenProcess(0x00100000,False,pid)
    if not handle:os._exit(0)
    kernel.WaitForSingleObject(handle,0xFFFFFFFF)
    kernel.CloseHandle(handle)
    os._exit(0)

if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stdin.reconfigure(encoding='utf-8')
    try:
        command = json.loads(sys.stdin.readline())
        if command.get('parentPid'):
            threading.Thread(target=watch_parent,args=(int(command['parentPid']),),daemon=True).start()
        asyncio.run(main(command))
    except Exception as exc:
        emit('error', message=str(exc) or type(exc).__name__)
        sys.exit(1)
